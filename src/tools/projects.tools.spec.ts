// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { ProjectsTools } from './projects.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('ProjectsTools', () => {
  let tools: ProjectsTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new ProjectsTools(
      mockGraphqlClient as unknown as GraphQLClientService,
    );
  });

  function callTool(
    name: string,
    args: Record<string, unknown>,
    authToken = 'test-token',
  ): Promise<McpToolResult> | McpToolResult {
    const toolMap = tools.getTools();
    const tool = toolMap.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args, authToken);
  }

  describe('tool registration', () => {
    it('should register all expected tools', () => {
      const names = Array.from(tools.getTools().keys());
      expect(names).toContain('list_projects');
      expect(names).toContain('get_project');
      expect(names).toContain('create_project');
      expect(names).toHaveLength(3);
    });

    it('should have correct input schemas', () => {
      const toolMap = tools.getTools();
      const listProjects = toolMap.get('list_projects')!;
      expect(listProjects.definition.inputSchema.required).toBeUndefined();

      const getProject = toolMap.get('get_project')!;
      expect(getProject.definition.inputSchema.required).toEqual(['projectId']);
    });
  });

  describe('list_projects', () => {
    const mockProjects = [
      {
        id: 'p-1',
        name: 'Project Alpha',
        archivedStatus: false,
      },
      {
        id: 'p-2',
        name: 'Project Beta',
        archivedStatus: false,
      },
    ];

    it('should list active projects by default', async () => {
      mockGraphqlClient.query.mockResolvedValue({ userProjects: mockProjects });

      const result = await callTool('list_projects', {});
      const data = parseToolResult<{ name: string }[]>(result);

      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Project Alpha');
      expect(data[1].name).toBe('Project Beta');
      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toEqual({});
      expect(token).toBe('test-token');
    });

    it('should return empty list when no projects exist', async () => {
      mockGraphqlClient.query.mockResolvedValue({ userProjects: [] });

      const result = await callTool('list_projects', {});
      const data = parseToolResult<unknown[]>(result);

      expect(data).toHaveLength(0);
    });
  });

  describe('get_project', () => {
    const mockProject = {
      id: 'p-1',
      name: 'Project Alpha',
      archivedStatus: false,
      backlog: {
        id: 'bl-1',
        items: [
          { id: 'bt-1', name: 'Task 1', status: 'notDone', assignedTo: [] },
        ],
      },
    };

    it('should return project details with backlog', async () => {
      mockGraphqlClient.query.mockResolvedValue({ project: mockProject });

      const result = await callTool('get_project', { projectId: 'p-1' });
      const data = parseToolResult<{
        id: string;
        name: string;
        backlog: { id: string; items: unknown[] };
      }>(result);

      expect(data.id).toBe('p-1');
      expect(data.name).toBe('Project Alpha');
      expect(data.backlog.id).toBe('bl-1');
      expect(data.backlog.items).toHaveLength(1);
      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toEqual({ id: 'p-1' });
      expect(token).toBe('test-token');
    });

    it('should throw when projectId is missing', async () => {
      await expect(callTool('get_project', {})).rejects.toThrow('projectId');
    });
  });

  describe('create_project', () => {
    const created = { id: '500', name: 'Apollo' };
    const sections = {
      project: {
        id: '500',
        name: 'Apollo',
        backlog: { id: '501' },
        qa: { id: '502' },
      },
    };
    const accessRights = {
      updateProjectUserAccessRights: { accessRights: { isMainManager: true } },
    };
    const projectA = {
      id: '9',
      name: 'ProjectA',
      backlog: { id: '10' },
      qa: { id: '11' },
    };
    const directory = {
      users: [
        {
          __typename: 'NormalUser',
          id: '1',
          name: 'Admin',
          isDeleted: false,
          isLocked: false,
        },
        {
          __typename: 'NormalUser',
          id: '13',
          name: 'UserA',
          isDeleted: false,
          isLocked: false,
        },
        {
          __typename: 'QaUser',
          id: '20',
          name: 'Tester',
          isDeleted: false,
          isLocked: false,
        },
        {
          __typename: 'NormalUser',
          id: '30',
          name: 'Gone',
          isDeleted: true,
          isLocked: false,
        },
      ],
      userGroups: [
        {
          id: '4',
          name: 'Developers',
          project: null,
          users: [{ id: '13' }],
        },
        { id: '7', name: 'Local team', project: { id: '9' }, users: [] },
      ],
    };

    function respond(responses: Record<string, unknown>) {
      mockGraphqlClient.getCurrentUser.mockResolvedValue({
        id: '1',
        name: 'Admin',
      });
      mockGraphqlClient.query.mockImplementation((query: string) => {
        const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '';
        const response = responses[operation];
        if (response instanceof Error) return Promise.reject(response);
        if (response === undefined) {
          return Promise.reject(new Error(`unexpected ${operation}`));
        }
        return Promise.resolve(response);
      });
    }

    function operations(): string[] {
      return (mockGraphqlClient.query.mock.calls as Array<[string]>).map(
        ([query]) => /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '',
      );
    }

    function calls(operation: string): Array<Record<string, unknown>> {
      return (
        mockGraphqlClient.query.mock.calls as Array<
          [string, Record<string, unknown>]
        >
      )
        .filter(([query]) => query.includes(`${operation}(`))
        .map(([, variables]) => variables);
    }

    it('creates a project and adds the caller as main manager by default', async () => {
      respond({
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        AddProjectUser: { addProjectUser: { id: '500' } },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: ' Apollo ',
        methodTemplate: 'lean',
        defaultMode: 'taskScheduling',
      });

      expect(calls('CreateProject')).toEqual([
        {
          input: {
            name: 'Apollo',
            methodTemplate: 'lean',
            defaultMode: 'taskScheduling',
          },
        },
      ]);
      expect(calls('AddProjectUser')).toEqual([
        { projectID: '500', userID: '1' },
      ]);
      expect(calls('UpdateProjectUserAccessRights')).toEqual([
        {
          projectID: '500',
          userID: '1',
          accessRights: { isMainManager: true },
        },
      ]);
      expect(parseToolResult(result)).toEqual({
        project: { id: '500', name: 'Apollo', backlogID: '501', qaID: '502' },
        members: [],
        managers: ['Admin'],
      });
    });

    it('notes that the caller will not see a project they were not added to', async () => {
      respond({
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        GetProjectMemberIds: { project: { users: [] } },
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        addMeAsManager: false,
      });

      expect(calls('AddProjectUser')).toEqual([]);
      expect(parseToolResult<{ note: string }>(result).note).toContain(
        'will not appear in your list_projects',
      );
    });

    it('omits the note when the caller was added another way', async () => {
      respond({
        GetUsersAndGroups: directory,
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        AddProjectUser: { addProjectUser: { id: '500' } },
        UpdateProjectUserAccessRights: accessRights,
        GetProjectMemberIds: { project: { users: [{ user: { id: '1' } }] } },
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        addMeAsManager: false,
        managers: ['Admin'],
      });

      expect(parseToolResult(result)).not.toHaveProperty('note');
    });

    it('resolves members and managers by name, adding groups before users', async () => {
      respond({
        GetUsersAndGroups: directory,
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        AddProjectUserGroup: { addProjectUserGroup: { id: '500' } },
        GetProjectMemberIds: { project: { users: [{ user: { id: '13' } }] } },
        AddProjectUser: { addProjectUser: { id: '500' } },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        members: ['developers', 'Tester', '13', 'Tester'],
        managers: ['usera'],
      });

      const order = operations();
      expect(order.indexOf('AddProjectUserGroup')).toBeLessThan(
        order.indexOf('AddProjectUser'),
      );
      expect(calls('AddProjectUserGroup')).toEqual([
        { projectID: '500', userGroupID: '4' },
      ]);
      expect(calls('AddProjectUser')).toEqual([
        { projectID: '500', userID: '1' },
        { projectID: '500', userID: '20' },
      ]);
      expect(
        calls('UpdateProjectUserAccessRights').map((call) => call.userID),
      ).toEqual(['1', '13']);
      expect(parseToolResult(result)).toMatchObject({
        members: ['Developers', 'Tester', 'UserA'],
        managers: ['Admin', 'UserA'],
      });
    });

    it('keeps a user and a group that share an id as separate members', async () => {
      respond({
        GetUsersAndGroups: {
          ...directory,
          userGroups: [{ id: '13', name: 'Ops', project: null, users: [] }],
        },
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        AddProjectUserGroup: { addProjectUserGroup: { id: '500' } },
        GetProjectMemberIds: { project: { users: [] } },
        AddProjectUser: { addProjectUser: { id: '500' } },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        members: ['UserA', 'Ops'],
      });

      expect(parseToolResult(result)).toMatchObject({
        members: ['UserA', 'Ops'],
      });
    });

    it('explains members that exist but cannot be added, before creating anything', async () => {
      respond({ GetUsersAndGroups: directory });

      await expect(
        callTool('create_project', { name: 'Apollo', members: ['Nobody'] }),
      ).rejects.toThrow('unknown user or global user group "Nobody"');
      await expect(
        callTool('create_project', { name: 'Apollo', members: ['Gone'] }),
      ).rejects.toThrow(
        'create_project: Gone (30) is deleted and cannot be added',
      );
      await expect(
        callTool('create_project', { name: 'Apollo', members: ['Local team'] }),
      ).rejects.toThrow(
        'create_project: Local team (7) is a group of project 9; only global groups can be added, so add its people individually',
      );
      expect(calls('CreateProject')).toEqual([]);
    });

    it('explains managers that cannot be main managers', async () => {
      respond({ GetUsersAndGroups: directory });

      await expect(
        callTool('create_project', { name: 'Apollo', managers: ['Tester'] }),
      ).rejects.toThrow(
        'create_project: Tester (20) cannot be a main manager: only normal users can. Add them to members instead',
      );
      await expect(
        callTool('create_project', {
          name: 'Apollo',
          managers: ['Developers'],
        }),
      ).rejects.toThrow(
        'create_project: Developers (4) is a group; groups cannot be main managers',
      );
      await expect(
        callTool('create_project', { name: 'Apollo', managers: ['Gone'] }),
      ).rejects.toThrow(
        'create_project: Gone (30) is deleted and cannot be added',
      );
    });

    it('suggests similar names with the exact list to send', async () => {
      respond({ GetUsersAndGroups: directory });

      await expect(
        callTool('create_project', { name: 'Apollo', members: ['User A'] }),
      ).rejects.toThrow(
        'create_project: unknown user or global user group "User A". Did you mean: UserA (13)? If so, call again with the exact name in a list, e.g. ["UserA"]; otherwise ask the user.',
      );
      await expect(
        callTool('create_project', {
          name: 'Apollo',
          members: ['the developers team'],
        }),
      ).rejects.toThrow('Did you mean: Developers (4)?');
    });

    it('does not dump a long directory when nothing similar exists', async () => {
      respond({
        GetUsersAndGroups: {
          ...directory,
          users: Array.from({ length: 30 }, (_, index) => ({
            __typename: 'NormalUser',
            id: String(100 + index),
            name: `Person${index}`,
            isDeleted: false,
            isLocked: false,
          })),
        },
      });

      await expect(
        callTool('create_project', { name: 'Apollo', members: ['Zed'] }),
      ).rejects.toThrow(
        'No similar names among 31; check the spelling or pass the ID',
      );
    });

    it('reports a member that matches both a user and a group as ambiguous', async () => {
      respond({
        GetUsersAndGroups: {
          ...directory,
          userGroups: [{ id: '13', name: 'Ops', project: null, users: [] }],
        },
      });

      await expect(
        callTool('create_project', { name: 'Apollo', members: ['13'] }),
      ).rejects.toThrow(
        'create_project: member "13" is ambiguous: user UserA (13), group Ops (13)',
      );
    });

    it('copies a project, skipping users the copy already contains', async () => {
      respond({
        AllProjects: { projects: [projectA] },
        CloneProject: { cloneProject: created },
        GetProjectSections: sections,
        GetProjectMemberIds: {
          project: { users: [{ user: { id: '1' } }, { user: { id: '13' } }] },
        },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        copyFromProjectId: '9',
        copyUsers: true,
        copyColumns: true,
      });

      expect(calls('CloneProject')).toEqual([
        {
          input: {
            name: 'Apollo',
            sourceProjectID: '9',
            cloneUsers: true,
            cloneColumns: true,
          },
        },
      ]);
      expect(calls('AddProjectUser')).toEqual([]);
      expect(parseToolResult(result)).toMatchObject({
        copiedFrom: '9',
        copiedUsers: 2,
      });
    });

    it('reports a group the API will not link because its people were copied already', async () => {
      respond({
        GetUsersAndGroups: directory,
        AllProjects: { projects: [projectA] },
        CloneProject: { cloneProject: created },
        GetProjectSections: sections,
        GetProjectMemberIds: {
          project: { users: [{ user: { id: '1' } }, { user: { id: '13' } }] },
        },
        AddProjectUserGroup: new Error(
          'GraphQL Error: Failed to add user group to project',
        ),
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        copyFromProjectId: '9',
        copyUsers: true,
        members: ['Developers'],
      });

      expect(calls('AddProjectUserGroup')).toEqual([
        { projectID: '500', userGroupID: '4' },
      ]);
      const parsed = parseToolResult<Record<string, unknown>>(result);
      expect(parsed).toMatchObject({
        members: [],
        groupsNotLinked: ['Developers'],
      });
      expect(parsed.groupsNote).toContain('will not get access automatically');
      expect(parsed).not.toHaveProperty('failed');
    });

    it('links a requested group even when some of its people were copied', async () => {
      respond({
        GetUsersAndGroups: directory,
        AllProjects: { projects: [projectA] },
        CloneProject: { cloneProject: created },
        GetProjectSections: sections,
        GetProjectMemberIds: { project: { users: [{ user: { id: '1' } }] } },
        AddProjectUserGroup: { addProjectUserGroup: { id: '500' } },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', {
        name: 'Apollo',
        copyFromProjectId: '9',
        copyUsers: true,
        members: ['Developers'],
      });

      expect(calls('AddProjectUserGroup')).toHaveLength(1);
      expect(parseToolResult(result)).toMatchObject({
        members: ['Developers'],
      });
      expect(parseToolResult(result)).not.toHaveProperty('groupsNotLinked');
    });

    it('does not add the caller again when the server already made them a member', async () => {
      respond({
        CreateProject: { createProject: created },
        GetProjectSections: sections,
        GetProjectMemberIds: { project: { users: [{ user: { id: '1' } }] } },
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', { name: 'Apollo' });

      expect(calls('AddProjectUser')).toEqual([]);
      expect(calls('UpdateProjectUserAccessRights')).toHaveLength(1);
      expect(parseToolResult(result)).not.toHaveProperty('failed');
    });

    it.each([
      [
        '11',
        'create_project: 11 is the QA section of project "ProjectA". A single section cannot be copied, only the whole project (id 9); ask the user before copying all of it',
      ],
      [
        'projecta',
        'create_project: \'copyFromProjectId\' must be an ID, not a name. Project "ProjectA" has id 9',
      ],
      [
        '99999',
        'create_project: no project with id or name "99999". Use a project id from list_projects',
      ],
    ])(
      'resolves copyFromProjectId %p before creating anything',
      async (copyFromProjectId, message) => {
        respond({ AllProjects: { projects: [projectA, null] } });

        await expect(
          callTool('create_project', { name: 'Apollo', copyFromProjectId }),
        ).rejects.toThrow(message);
        expect(calls('CloneProject')).toEqual([]);
      },
    );

    it('treats a numeric project name as a name when no project has that id', async () => {
      respond({
        AllProjects: {
          projects: [{ ...projectA, id: '917', name: '2024' }],
        },
      });

      await expect(
        callTool('create_project', {
          name: 'Apollo',
          copyFromProjectId: '2024',
        }),
      ).rejects.toThrow('Project "2024" has id 917');
    });

    it('rejects a blank copyFromProjectId', async () => {
      await expect(
        callTool('create_project', { name: 'Apollo', copyFromProjectId: '  ' }),
      ).rejects.toThrow(
        "create_project: 'copyFromProjectId' must not be empty",
      );
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('rejects copy-only options without copyFromProjectId and template options with it', async () => {
      await expect(
        callTool('create_project', { name: 'Apollo', copyColumns: true }),
      ).rejects.toThrow(
        'create_project: copyColumns only apply together with copyFromProjectId',
      );
      await expect(
        callTool('create_project', {
          name: 'Apollo',
          copyFromProjectId: '9',
          methodTemplate: 'lean',
        }),
      ).rejects.toThrow(
        'create_project: methodTemplate cannot be set when copying; they are copied from project 9',
      );
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('explains that creating projects needs administrator rights', async () => {
      respond({ CreateProject: new Error('GraphQL Error: Access forbidden') });

      await expect(
        callTool('create_project', { name: 'Apollo' }),
      ).rejects.toThrow(
        'GraphQL Error: Access forbidden. Creating projects requires P4 Plan administrator rights',
      );
    });

    it('explains administrator rights when the user directory is forbidden', async () => {
      respond({
        GetUsersAndGroups: new Error('GraphQL Error: Access forbidden'),
      });

      await expect(
        callTool('create_project', { name: 'Apollo', members: ['UserA'] }),
      ).rejects.toThrow(
        'GraphQL Error: Access forbidden. Creating projects requires P4 Plan administrator rights',
      );
      expect(calls('CreateProject')).toEqual([]);
    });

    it('passes a duplicate-name error through unchanged', async () => {
      respond({
        CreateProject: new Error(
          'GraphQL Error: Project with that name already exists',
        ),
      });

      await expect(
        callTool('create_project', { name: 'Apollo' }),
      ).rejects.toThrow(
        /^GraphQL Error: Project with that name already exists$/,
      );
    });

    it('reports steps that fail after the project exists instead of throwing', async () => {
      respond({
        CreateProject: { createProject: created },
        GetProjectSections: new Error('GraphQL Error: timeout'),
        AddProjectUser: new Error(
          'GraphQL Error: Failed to add user to project',
        ),
        UpdateProjectUserAccessRights: accessRights,
      });

      const result = await callTool('create_project', { name: 'Apollo' });

      expect(calls('UpdateProjectUserAccessRights')).toEqual([]);
      expect(parseToolResult(result)).toEqual({
        project: { id: '500', name: 'Apollo' },
        members: [],
        managers: ['Admin'],
        failed: [
          { step: 'read section ids', error: 'GraphQL Error: timeout' },
          {
            step: 'add user Admin',
            error: 'GraphQL Error: Failed to add user to project',
          },
        ],
      });
    });

    it('requires a name', async () => {
      await expect(callTool('create_project', {})).rejects.toThrow(
        "create_project: 'name' is required",
      );
    });
  });
});
