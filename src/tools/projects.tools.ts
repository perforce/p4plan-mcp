// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import {
  NamedId,
  ProjectSections,
  ToolRegistration,
  describeCandidates,
  findNamedMatches,
  findProjectByName,
  isMeaningful,
  validateRequired,
} from './task-helpers';
import {
  LIST_PROJECTS_QUERY,
  GET_PROJECT_QUERY,
  GET_PROJECT_SECTIONS_QUERY,
  ALL_PROJECTS_QUERY,
  CREATE_PROJECT_MUTATION,
  CLONE_PROJECT_MUTATION,
  ADD_PROJECT_USER_MUTATION,
  ADD_PROJECT_USER_GROUP_MUTATION,
  UPDATE_PROJECT_USER_ACCESS_RIGHTS_MUTATION,
  GET_PROJECT_MEMBER_IDS_QUERY,
  GET_USERS_AND_GROUPS_QUERY,
} from '../graphql';

const TOOL = 'create_project';

const COPY_ONLY_PARAMETERS = ['copyUsers', 'copyColumns'];
const NEW_PROJECT_ONLY_PARAMETERS = ['methodTemplate', 'defaultMode'];

interface Member extends NamedId {
  kind: 'user' | 'group';
  userIds?: string[];
}

interface Team {
  members: Member[];
  managers: NamedId[];
}

interface Failure {
  step: string;
  error: string;
}

const FILLER_WORDS = new Set([
  'the',
  'team',
  'group',
  'users',
  'people',
  'everyone',
  'in',
  'of',
]);

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function looseKey(value: string): string {
  return value.toLowerCase().replace(/[\s_.-]+/g, '');
}

function searchKey(value: string): string {
  const words = value
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter(Boolean);
  const meaningful = words.filter((word) => !FILLER_WORDS.has(word));
  return (meaningful.length > 0 ? meaningful : words).join('');
}

function describeLookupFailure(ref: string, candidates: NamedId[]): string {
  const key = searchKey(ref);
  const similar = candidates.filter((candidate) => {
    const name = looseKey(candidate.name);
    return (
      key.length > 0 &&
      (name.includes(key) || (name.length >= 3 && key.includes(name)))
    );
  });
  if (similar.length > 0) {
    const listed = similar
      .slice(0, 5)
      .map((candidate) => `${candidate.name} (${candidate.id})`)
      .join(', ');
    return `Did you mean: ${listed}? If so, call again with the exact name in a list, e.g. ${JSON.stringify([similar[0].name])}; otherwise ask the user.`;
  }
  return candidates.length <= 20
    ? describeCandidates(candidates)
    : `No similar names among ${candidates.length}; check the spelling or pass the ID`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withAdminHint(error: unknown): Error {
  const message = errorMessage(error);
  if (/access forbidden/i.test(message)) {
    return new Error(
      `${message}. Creating projects requires P4 Plan administrator rights`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(message);
}

@Injectable()
export class ProjectsTools {
  constructor(private readonly graphqlClient: GraphQLClientService) {}

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    tools.set('list_projects', {
      definition: {
        name: 'list_projects',
        description:
          'List all active projects the current user is a member of. Returns project IDs and names backlogID (needed for backlog operations) and qaID (needed for bug operations). The project ID itself is used for planning/schedule operations. Call this first to discover projectId values needed by other tools.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: (args, authToken) => this.listProjects(args, authToken),
    });

    // get_project
    tools.set('get_project', {
      definition: {
        name: 'get_project',
        description: `Get a project's configuration and section IDs. Returns backlogID (needed for backlog operations) and qaID (needed for bug operations). The project ID itself is used for planning/schedule operations.`,
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
          },
          required: ['projectId'],
        },
      },
      handler: (args, authToken) => this.getProject(args, authToken),
    });

    // create_project
    tools.set('create_project', {
      definition: {
        name: 'create_project',
        description:
          'Create a P4 Plan project and set up its team in one call. Requires P4 Plan administrator rights. You are added as main manager unless addMeAsManager is false (set it false if the user names other managers and lists themselves only as a member). Names in members/managers are resolved before anything is created. To base it on an existing project pass copyFromProjectId: its settings (and on newer servers its workflows/pipelines) are copied, plus users/columns only if copyUsers/copyColumns are true (ask if unclear). Items/tasks are never copied and a single section cannot be copied: if the user asks for that, say so and ask before making a plain copy. Returns the project id, backlogID and qaID. If "failed" is non-empty the project WAS created: report it, do not call again (that creates a duplicate). Projects cannot be renamed or deleted via MCP.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'The project name. Must be unique (exact match, archived projects included). Ask the user if they gave none; never invent one',
            },
            copyFromProjectId: {
              type: 'string',
              description:
                'Optional: id of the project to copy (from list_projects); always the whole project, never one section',
            },
            copyUsers: {
              type: 'boolean',
              description: 'With copyFromProjectId: also copy its members',
            },
            copyColumns: {
              type: 'boolean',
              description:
                'With copyFromProjectId: also copy its columns, incl. custom columns',
            },
            methodTemplate: {
              type: 'string',
              enum: ['scrum', 'lean', 'xp'],
              enumAliases: { extremeProgramming: 'xp', kanban: 'lean' },
              description:
                'New projects only: terminology template (default scrum; lean = iterations/feature lists, also for kanban)',
            },
            defaultMode: {
              type: 'string',
              enum: ['agile', 'taskScheduling'],
              enumAliases: {
                gantt: 'taskScheduling',
                scheduling: 'taskScheduling',
                waterfall: 'taskScheduling',
                scrum: 'agile',
              },
              description:
                'New projects only: default view for new users (agile, or taskScheduling = Gantt). Default agile',
            },
            members: {
              type: 'array',
              items: { type: 'string' },
              description:
                'People, teams or groups the user names, by name or ID. Pass the group name itself, e.g. "the design team" → "design", "everyone in QA Leads" → "QA Leads"',
            },
            managers: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Normal users to add as main managers, by name or ID (not groups or QA users)',
            },
            addMeAsManager: {
              type: 'boolean',
              description:
                'Add yourself as main manager so you can keep working on the project (default true). If false and you are not added otherwise, you will not see it in list_projects',
            },
          },
          required: ['name'],
        },
      },
      handler: (args, authToken) => this.createProject(args, authToken),
    });

    return tools;
  }

  private async listProjects(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const result = await this.graphqlClient.query<{
      userProjects: Array<{
        id: string;
        name: string;
        backlog: {
          id: string;
        };
        qa: {
          id: string;
        };
      }>;
    }>(LIST_PROJECTS_QUERY, {}, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.userProjects),
        },
      ],
    };
  }

  private async getProject(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'get_project');
    const projectId = args.projectId as string;

    const result = await this.graphqlClient.query<{
      project: {
        id: string;
        name: string;
        backlog: {
          id: string;
        };
        qa: {
          id: string;
        };
      };
    }>(GET_PROJECT_QUERY, { id: projectId }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.project),
        },
      ],
    };
  }

  private async createProject(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['name'], TOOL);
    const name = String(args.name).trim();
    if (!name) throw new Error(`${TOOL}: 'name' must not be empty`);

    const copyFrom = isMeaningful(args.copyFromProjectId)
      ? String(args.copyFromProjectId).trim()
      : undefined;
    if (copyFrom === '') {
      throw new Error(`${TOOL}: 'copyFromProjectId' must not be empty`);
    }
    const misplaced = copyFrom
      ? NEW_PROJECT_ONLY_PARAMETERS.filter((key) => isMeaningful(args[key]))
      : COPY_ONLY_PARAMETERS.filter((key) => isMeaningful(args[key]));
    if (misplaced.length > 0) {
      throw new Error(
        copyFrom
          ? `${TOOL}: ${misplaced.join(', ')} cannot be set when copying; they are copied from project ${copyFrom}`
          : `${TOOL}: ${misplaced.join(', ')} only apply together with copyFromProjectId`,
      );
    }
    const addMe = args.addMeAsManager !== false;

    let team: Team;
    let sourceId: string | undefined;
    let me: NamedId;
    try {
      team = await this.resolveTeam(
        toStringList(args.members),
        toStringList(args.managers),
        authToken,
      );
      sourceId = copyFrom
        ? await this.resolveSourceProject(copyFrom, authToken)
        : undefined;
      me = await this.graphqlClient.getCurrentUser(authToken);
    } catch (error) {
      throw withAdminHint(error);
    }

    const project = await this.createOrCloneProject(
      name,
      sourceId,
      args,
      authToken,
    ).catch((error: unknown) => {
      throw withAdminHint(error);
    });

    const failed: Failure[] = [];
    const attempt = (step: string, run: () => Promise<unknown>) =>
      run().then(
        () => true,
        (error: unknown) => {
          failed.push({ step, error: errorMessage(error) });
          return false;
        },
      );

    const sections = await this.graphqlClient
      .query<{ project: ProjectSections }>(
        GET_PROJECT_SECTIONS_QUERY,
        { id: project.id },
        authToken,
      )
      .then((result) => result.project)
      .catch((error: unknown) => {
        failed.push({ step: 'read section ids', error: errorMessage(error) });
        return undefined;
      });

    const copiedMemberIds =
      sourceId && args.copyUsers === true
        ? await this.getMemberIds(project.id, authToken)
        : undefined;

    const groups = team.members.filter(
      (member) =>
        member.kind === 'group' &&
        !(
          copiedMemberIds &&
          member.userIds?.length &&
          member.userIds.every((id) => copiedMemberIds.has(id))
        ),
    );
    for (const group of groups) {
      await attempt(`add group ${group.name}`, () =>
        this.graphqlClient.query(
          ADD_PROJECT_USER_GROUP_MUTATION,
          { projectID: project.id, userGroupID: group.id },
          authToken,
        ),
      );
    }
    const existingMemberIds =
      (groups.length > 0
        ? await this.getMemberIds(project.id, authToken)
        : copiedMemberIds) ?? new Set<string>();

    const managers = uniqueBy(
      [...(addMe ? [me] : []), ...team.managers],
      (manager) => manager.id,
    );
    const users = uniqueBy(
      [...managers, ...team.members.filter((member) => member.kind === 'user')],
      (user) => user.id,
    );
    const notAdded = new Set<string>();
    for (const user of users) {
      if (existingMemberIds.has(user.id)) continue;
      const added = await attempt(`add user ${user.name}`, () =>
        this.graphqlClient.query(
          ADD_PROJECT_USER_MUTATION,
          { projectID: project.id, userID: user.id },
          authToken,
        ),
      );
      if (!added) notAdded.add(user.id);
    }
    for (const manager of managers) {
      if (notAdded.has(manager.id)) continue;
      await attempt(`make ${manager.name} main manager`, () =>
        this.graphqlClient.query(
          UPDATE_PROJECT_USER_ACCESS_RIGHTS_MUTATION,
          {
            projectID: project.id,
            userID: manager.id,
            accessRights: { isMainManager: true },
          },
          authToken,
        ),
      );
    }

    const finalMemberIds = addMe
      ? undefined
      : await this.getMemberIds(project.id, authToken);
    const notMember =
      finalMemberIds !== undefined && !finalMemberIds.has(me.id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            project: {
              id: project.id,
              name: project.name,
              ...(sections
                ? { backlogID: sections.backlog.id, qaID: sections.qa.id }
                : {}),
            },
            ...(sourceId ? { copiedFrom: sourceId } : {}),
            ...(copiedMemberIds ? { copiedUsers: copiedMemberIds.size } : {}),
            members: team.members.map((member) => member.name),
            managers: managers.map((manager) => manager.name),
            ...(failed.length > 0 ? { failed } : {}),
            ...(notMember
              ? {
                  note: 'You are not a member, so this project will not appear in your list_projects. The id above is the project; do not create it again.',
                }
              : {}),
          }),
        },
      ],
    };
  }

  private async resolveTeam(
    memberRefs: string[],
    managerRefs: string[],
    authToken: string,
  ): Promise<Team> {
    if (memberRefs.length === 0 && managerRefs.length === 0) {
      return { members: [], managers: [] };
    }
    const result = await this.graphqlClient.query<{
      users: Array<
        | (NamedId & {
            __typename: string;
            isDeleted: boolean;
            isLocked: boolean;
          })
        | null
      >;
      userGroups: Array<
        | (NamedId & {
            project: { id: string } | null;
            users: Array<{ id: string } | null>;
          })
        | null
      >;
    }>(GET_USERS_AND_GROUPS_QUERY, {}, authToken);

    const allUsers = result.users.filter(
      (user): user is NonNullable<typeof user> => user !== null,
    );
    const users = allUsers.filter((user) => !user.isDeleted && !user.isLocked);
    const inactiveUsers = allUsers.filter(
      (user) => user.isDeleted || user.isLocked,
    );
    const normalUsers = users.filter(
      (user) => user.__typename === 'NormalUser',
    );
    const allGroups = result.userGroups.filter(
      (group): group is NonNullable<typeof group> => group !== null,
    );
    const groups = allGroups.filter((group) => group.project === null);
    const projectGroups = allGroups.filter(
      (
        group,
      ): group is (typeof allGroups)[number] & {
        project: { id: string };
      } => group.project !== null,
    );

    const explainIneligible = (ref: string): string | undefined => {
      const inactive = findNamedMatches(ref, inactiveUsers)[0];
      if (inactive) {
        return `${inactive.name} (${inactive.id}) is ${inactive.isDeleted ? 'deleted' : 'locked'} and cannot be added`;
      }
      const projectGroup = findNamedMatches(ref, projectGroups)[0];
      if (projectGroup) {
        return `${projectGroup.name} (${projectGroup.id}) is a group of project ${projectGroup.project.id}; only global groups can be added, so add its people individually`;
      }
      return undefined;
    };

    const members = memberRefs.map((ref): Member => {
      const matches: Member[] = [
        ...findNamedMatches(ref, users).map(
          ({ id, name }): Member => ({ id, name, kind: 'user' }),
        ),
        ...findNamedMatches(ref, groups).map(
          ({ id, name, users: groupUsers }): Member => ({
            id,
            name,
            kind: 'group',
            userIds: groupUsers
              .filter((user) => user !== null)
              .map((user) => user.id),
          }),
        ),
      ];
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        throw new Error(
          `${TOOL}: member "${ref}" is ambiguous: ${matches.map((match) => `${match.kind} ${match.name} (${match.id})`).join(', ')}. Pass a unique name or ID`,
        );
      }
      const reason = explainIneligible(ref);
      throw new Error(
        reason
          ? `${TOOL}: ${reason}`
          : `${TOOL}: unknown user or global user group "${ref}". ${describeLookupFailure(ref, [...users, ...groups])}`,
      );
    });

    const managers = managerRefs.map((ref): NamedId => {
      const matches = findNamedMatches(ref, normalUsers);
      if (matches.length === 1) {
        return { id: matches[0].id, name: matches[0].name };
      }
      if (matches.length > 1) {
        throw new Error(
          `${TOOL}: manager "${ref}" is ambiguous: ${matches.map((match) => `${match.name} (${match.id})`).join(', ')}. Pass the ID instead`,
        );
      }
      const reason = explainIneligible(ref);
      if (reason) throw new Error(`${TOOL}: ${reason}`);
      const group = findNamedMatches(ref, groups)[0];
      if (group) {
        throw new Error(
          `${TOOL}: ${group.name} (${group.id}) is a group; groups cannot be main managers. Add it to members and name individual managers`,
        );
      }
      const otherUser = findNamedMatches(ref, users)[0];
      if (otherUser) {
        throw new Error(
          `${TOOL}: ${otherUser.name} (${otherUser.id}) cannot be a main manager: only normal users can. Add them to members instead`,
        );
      }
      throw new Error(
        `${TOOL}: unknown manager "${ref}". ${describeLookupFailure(ref, normalUsers)}`,
      );
    });

    return {
      members: uniqueBy(members, (member) => `${member.kind}:${member.id}`),
      managers,
    };
  }

  private async resolveSourceProject(
    copyFrom: string,
    authToken: string,
  ): Promise<string> {
    const { projects } = await this.graphqlClient.query<{
      projects: Array<ProjectSections | null>;
    }>(ALL_PROJECTS_QUERY, {}, authToken);
    const known = projects.filter(
      (project): project is ProjectSections => project !== null,
    );

    if (known.some((project) => project.id === copyFrom)) return copyFrom;

    const owner = known.find((project) =>
      [project.backlog.id, project.qa.id].includes(copyFrom),
    );
    if (owner) {
      const section = owner.backlog.id === copyFrom ? 'backlog' : 'QA section';
      throw new Error(
        `${TOOL}: ${copyFrom} is the ${section} of project "${owner.name}". A single section cannot be copied, only the whole project (id ${owner.id}); ask the user before copying all of it`,
      );
    }
    const byName = findProjectByName(known, copyFrom);
    if (byName) {
      throw new Error(
        `${TOOL}: 'copyFromProjectId' must be an ID, not a name. Project "${byName.name}" has id ${byName.id}`,
      );
    }
    throw new Error(
      `${TOOL}: no project with id or name "${copyFrom}". Use a project id from list_projects`,
    );
  }

  private async createOrCloneProject(
    name: string,
    sourceId: string | undefined,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<NamedId> {
    const input: Record<string, unknown> = { name };
    if (sourceId) {
      input.sourceProjectID = sourceId;
      if (args.copyUsers !== undefined) input.cloneUsers = args.copyUsers;
      if (args.copyColumns !== undefined) input.cloneColumns = args.copyColumns;
    } else {
      for (const key of NEW_PROJECT_ONLY_PARAMETERS) {
        if (args[key] !== undefined) input[key] = args[key];
      }
    }

    const result = await this.graphqlClient.query<{
      createProject?: NamedId;
      cloneProject?: NamedId;
    }>(
      sourceId ? CLONE_PROJECT_MUTATION : CREATE_PROJECT_MUTATION,
      { input },
      authToken,
    );
    return (result.cloneProject ?? result.createProject) as NamedId;
  }

  private async getMemberIds(
    projectId: string,
    authToken: string,
  ): Promise<Set<string> | undefined> {
    return this.graphqlClient
      .query<{
        project: { users: Array<{ user: { id: string } } | null> };
      }>(GET_PROJECT_MEMBER_IDS_QUERY, { id: projectId }, authToken)
      .then(
        (result) =>
          new Set(
            result.project.users
              .filter((member) => member !== null)
              .map((member) => member.user.id),
          ),
      )
      .catch(() => undefined);
  }
}
