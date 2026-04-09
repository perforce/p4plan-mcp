// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import {
  TaskToolsBase,
  ToolRegistration,
  validateRequired,
} from './task-helpers';
import {
  CREATE_BACKLOG_TASKS_MUTATION,
  CREATE_SPRINT_TASKS_MUTATION,
  GET_PROJECT_BACKLOG_QUERY,
  SEARCH_TASKS_QUERY,
  GET_PROJECT_QA_QUERY,
  CREATE_BUG_MUTATION,
  CREATE_SCHEDULED_TASK_MUTATION,
  CREATE_SPRINT_MUTATION,
  CREATE_RELEASE_MUTATION,
  UPDATE_SPRINT_MUTATION,
  UPDATE_RELEASE_MUTATION,
  GET_TASKS_QUERY,
} from '../graphql';

/**
 * Task CRUD Tools
 *
 * Handles core task CRUD operations:
 * - get_tasks: Get detailed info for one or more tasks
 * - search_tasks: Search for tasks
 * - create_item: Create any item (backlog_task, bug, scheduled_task, sprint, release, sprint_task)
 * - update_item: Update any item (BacklogTask, Bug, ScheduledTask, Sprint, Release)
 * - complete_task: Mark task completed
 * - start_task: Mark task in progress
 */
@Injectable()
export class TaskCrudTools extends TaskToolsBase {
  private readonly searchLimit: number;

  constructor(
    graphqlClient: GraphQLClientService,
    configService: ConfigService,
  ) {
    super(graphqlClient);
    this.searchLimit = configService.get<number>('searchLimit') ?? 400;
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    tools.set('get_tasks', {
      definition: {
        name: 'get_tasks',
        description:
          'Get full details of one or more items by ID (max 20). Works for BacklogTask, ScheduledTask, Bug, Sprint, and Release. Returns status, assignments, workflow state, and all type-specific fields.',
        inputSchema: {
          type: 'object',
          properties: {
            taskIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Array of task IDs to retrieve (max 20). For a single task, pass a one-element array.',
            },
          },
          required: ['taskIds'],
        },
      },
      handler: (args, authToken) => this.getTasks(args, authToken),
    });

    tools.set('search_tasks', {
      definition: {
        name: 'search_tasks',
        description:
          'Search for items in a project section using the P4 Plan Find query. Before composing `findQuery`, always call the `read_skill` tool with skillName="search-queries" for exact query syntax. Each project has three sections with different IDs — Backlog, QA, and Planning — ask the user which section to search before calling this tool. Items with a committedToProjectID are already committed to a sprint — confirm with the user before modifying committed items. IMPORTANT: if this tool returns an error or zero results 3 times in a row, STOP retrying and ask the user for help — describe what you tried, show the exact findQuery values you used, and ask the user to clarify the column names, values, or section ID.',
        inputSchema: {
          type: 'object',
          properties: {
            findQuery: {
              type: 'string',
              description:
                'P4 Plan Find query. Values use human-readable text, NOT enum values. Examples: Itemname:Text("login"), Itemtype="Bug" AND Status="Not done", Severity="Critical", Bugpriority="Very high priority", Assignedto:Resource("john"), GeneralconditionIncurrentsprint=true. For simple name search use Itemname:Text("text"). See search-queries skill for full syntax.',
            },
            projectId: {
              type: 'string',
              description:
                'The project section ID to search in. A project has three sections with different IDs: Planning (project ID), Backlog (backlog ID), and QA (QA ID). Ask the user which section to search if unclear. Use get_project to retrieve the section IDs.',
            },
          },
          required: ['findQuery', 'projectId'],
        },
      },
      handler: (args, authToken) => this.searchTasks(args, authToken),
    });

    tools.set('create_item', {
      definition: {
        name: 'create_item',
        description:
          'Create a new item in P4 Plan. Supports creating BacklogTask, Bug, ScheduledTask, Sprint, Release, or SprintTask. The "type" parameter determines which item is created and which optional fields apply. When parentItemId is provided, first call get_tasks on that parent — if it has a committedToProjectID, ask the user whether they want the sub-items created in the sprint or in the backlog before proceeding.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'backlog_task',
                'bug',
                'scheduled_task',
                'sprint',
                'release',
                'sprint_task',
              ],
              description:
                'The type of item to create. backlog_task: task in backlog. bug: bug in QA section. scheduled_task: Gantt/planning task. sprint: new sprint. release: release milestone. sprint_task: task directly inside a sprint.',
            },
            projectId: {
              type: 'string',
              description:
                'The project ID (required for all types except sprint_task)',
            },
            sprintId: {
              type: 'string',
              description: 'The sprint ID (required for sprint_task only)',
            },
            name: {
              type: 'string',
              description: 'The name/title or description of the item',
            },
            priority: {
              type: 'string',
              enum: ['veryHigh', 'high', 'medium', 'low', 'veryLow', 'none'],
              description: 'Priority level (backlog_task, bug, sprint_task)',
            },
            severity: {
              type: 'string',
              enum: ['A', 'B', 'C', 'D', 'none'],
              description:
                'Bug severity: A=Critical, B=High, C=Medium, D=Low (bug only)',
            },
            detailedDescription: {
              type: 'string',
              description: 'Detailed description (bug only)',
            },
            stepsToReproduce: {
              type: 'string',
              description: 'Steps to reproduce (bug only)',
            },
            estimatedDays: {
              type: 'number',
              description: 'Estimated days to complete (scheduled_task only)',
            },
            start: {
              type: 'string',
              description: 'Start date YYYY-MM-DD (scheduled_task, sprint)',
            },
            finish: {
              type: 'string',
              description: 'End date YYYY-MM-DD (scheduled_task, sprint)',
            },
            date: {
              type: 'string',
              description: 'Release date YYYY-MM-DD (release only)',
            },
            previousItemId: {
              type: 'string',
              description:
                'ID of the item after which to insert the new item in the tree list. If omitted the item is created at the top. Not supported for bug type. (backlog_task, scheduled_task, sprint, release, sprint_task)',
            },
            parentItemId: {
              type: 'string',
              description:
                'ID of the parent item — the new item will be created as a child of this item. Convenience shortcut: sets previousItemId to this value and indentation to child level. Not supported for bug type. (backlog_task, scheduled_task, sprint_task)',
            },
          },
          required: ['type', 'name'],
        },
      },
      handler: (args, authToken) => this.createItem(args, authToken),
    });

    // complete_task - convenience method
    tools.set('complete_task', {
      definition: {
        name: 'complete_task',
        description:
          'Mark a task as completed. Works for any task type (BacklogTask, ScheduledTask, Bug).',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The unique ID of the task to complete',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.completeTask(args, authToken),
    });

    // start_task - convenience method
    tools.set('start_task', {
      definition: {
        name: 'start_task',
        description:
          'Mark a task as in-progress. Works for any task type (BacklogTask, ScheduledTask, Bug).',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The unique ID of the task to start',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.startTask(args, authToken),
    });

    // update_item - general update for any item type
    tools.set('update_item', {
      definition: {
        name: 'update_item',
        description:
          'Update one or more properties on any P4 Plan item: BacklogTask, Bug, ScheduledTask, Sprint, or Release. Automatically detects the item type and applies the correct mutation. The "itemId" parameter is always required. Some fields are type-specific — see parameter descriptions for which item types support each field.',
        inputSchema: {
          type: 'object',
          properties: {
            // -- Universal --
            itemId: {
              type: 'string',
              description: 'The unique ID of the item to update (required)',
            },
            name: {
              type: 'string',
              description: 'New name/title or description (all types)',
            },
            hidden: {
              type: 'boolean',
              description: 'Whether the item should be hidden (all types)',
            },
            color: {
              type: 'string',
              enum: [
                'notSet',
                'red',
                'orange',
                'yellow',
                'green',
                'cyan',
                'blue',
                'magenta',
                'pink',
                'brown',
                'white',
                'black',
              ],
              description: 'Item color (all types)',
            },
            hyperlink: {
              type: 'string',
              description: 'Hyperlink URL to attach to the item (all types)',
            },

            // -- Task types: BacklogTask, Bug, ScheduledTask --
            status: {
              type: 'string',
              enum: ['notDone', 'inProgress', 'completed', 'blocked'],
              description: 'Item status (BacklogTask, Bug, ScheduledTask)',
            },
            assignedTo: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userID: {
                    type: 'string',
                    description: 'The user ID to assign',
                  },
                  percentageAllocation: {
                    type: 'number',
                    description: 'Allocation percentage 0–32000 (default: 100)',
                  },
                },
                required: ['userID'],
              },
              description:
                'Assign users to this item. Replaces all current assignees — include existing users to keep them. For sprint tasks, users must be sprint members first (use allocations on the Sprint). (BacklogTask, Bug, ScheduledTask)',
            },
            confidence: {
              type: 'string',
              enum: ['none', 'low', 'medium', 'high'],
              description:
                'Confidence level (BacklogTask, Bug, ScheduledTask, Sprint)',
            },
            risk: {
              type: 'string',
              enum: ['none', 'low', 'medium', 'high'],
              description:
                'Risk level (BacklogTask, Bug, ScheduledTask, Sprint)',
            },
            points: {
              type: 'number',
              description: 'Story points (BacklogTask, Bug, ScheduledTask)',
            },
            estimatedDays: {
              type: 'number',
              description:
                'Estimated days to complete; cannot be negative (BacklogTask, Bug, ScheduledTask)',
            },
            workflowID: {
              type: 'string',
              description:
                'Workflow ID to set on the item; pass "-1" to remove existing workflow (BacklogTask, Bug, ScheduledTask)',
            },
            workflowStatusId: {
              type: 'string',
              description:
                'Workflow status ID — get IDs from get_workflows (BacklogTask, Bug, ScheduledTask)',
            },
            releaseIDs: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Release IDs to tag the item to. Use "NoRelease" to clear inherited releases, "-1" to inherit parent releases (BacklogTask, Bug, ScheduledTask, Sprint)',
            },

            // -- BacklogTask & Bug --
            priority: {
              type: 'string',
              enum: ['none', 'veryLow', 'low', 'medium', 'high', 'veryHigh'],
              description:
                'Backlog priority (BacklogTask, ScheduledTask) or bug priority (Bug)',
            },
            sprintPriority: {
              type: 'string',
              enum: ['none', 'veryLow', 'low', 'medium', 'high', 'veryHigh'],
              description:
                'Sprint priority; item must be committed to a sprint (BacklogTask, Bug)',
            },
            workRemaining: {
              type: 'number',
              description:
                'Work remaining in hours; setting to 0 auto-completes. Item must be in a sprint (BacklogTask, Bug)',
            },
            sprintID: {
              type: 'string',
              description: 'Sprint ID to commit the item to (BacklogTask, Bug)',
            },

            // -- BacklogTask only --
            category: {
              type: 'string',
              enum: [
                'none',
                'requirement',
                'enhancement',
                'technologyUpgrade',
                'bugA',
                'bugB',
                'bugC',
                'bugD',
              ],
              description: 'Backlog category (BacklogTask only)',
            },
            epic: {
              type: 'boolean',
              description: 'Mark as epic (BacklogTask only)',
            },

            // -- BacklogTask & ScheduledTask --
            isUserStory: {
              type: 'boolean',
              description: 'Mark as user story (BacklogTask, ScheduledTask)',
            },
            userStory: {
              type: 'string',
              description:
                'User story text; isUserStory must be true or set in same call (BacklogTask, ScheduledTask)',
            },

            // -- Bug only --
            severity: {
              type: 'string',
              enum: ['A', 'B', 'C', 'D', 'none'],
              description:
                'Bug severity: A=Critical, B=High, C=Medium, D=Low (Bug only)',
            },
            detailedDescription: {
              type: 'string',
              description: 'Detailed description (Bug only)',
            },
            stepsToReproduce: {
              type: 'string',
              description: 'Steps to reproduce (Bug only)',
            },

            // -- ScheduledTask only --
            percentCompleted: {
              type: 'number',
              description:
                'Percent completed 0-100; setting to 100 auto-completes (ScheduledTask only)',
            },
            start: {
              type: 'string',
              description: 'Start date YYYY-MM-DD (ScheduledTask, Sprint)',
            },
            finish: {
              type: 'string',
              description: 'End date YYYY-MM-DD (ScheduledTask, Sprint)',
            },
            subproject: {
              type: 'boolean',
              description:
                'Mark as subproject placeholder (ScheduledTask only)',
            },
            outOfOfficeStatus: {
              type: 'boolean',
              description:
                'Mark as out-of-office; affects availability of assigned users across all projects (ScheduledTask only)',
            },

            // -- Sprint only --
            allocations: {
              type: 'object',
              description: 'Sprint member allocations (Sprint only)',
              properties: {
                users: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      userID: { type: 'string' },
                      percentageAllocation: {
                        type: 'number',
                        description: '1-125%, defaults to 100',
                      },
                    },
                    required: ['userID'],
                  },
                  description: 'Users to allocate to the sprint',
                },
                allProjectMembers: {
                  type: 'boolean',
                  description: 'If true, add all project members to the sprint',
                },
              },
            },

            // -- Release only --
            date: {
              type: 'string',
              description: 'Release date YYYY-MM-DD (Release only)',
            },
          },
          required: ['itemId'],
        },
      },
      handler: (args, authToken) => this.updateItem(args, authToken),
    });

    return tools;
  }

  private async getTasks(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskIds'], 'get_tasks');
    const taskIds = args.taskIds as string[];

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error("get_tasks: 'taskIds' must be a non-empty array");
    }

    const MAX_IDS = 20;
    const ids = taskIds.slice(0, MAX_IDS);

    const result = await this.graphqlClient.query<{
      itemsByIDs: Array<{
        id: string;
        name: string;
        projectID: string;
        createdOn: string;
        lastUpdatedOn: string;
        isUserStory?: boolean;
        userStory?: string;
        status?: string;
        backlogPriority?: string;
        sprintPriority?: string;
        bugPriority?: string;
        severity?: string;
        detailedDescription?: string;
        stepsToReproduce?: string;
        confidence?: string;
        risk?: string;
        estimatedDays?: number;
        points?: number;
        duration?: number;
        percentCompleted?: number;
        workRemaining?: number;
        workflow?: { id: string; name: string };
        workflowStatus?: { id: string; name: string };
        assignedTo?: Array<{ user: { id: string; name: string } }>;
      }>;
    }>(GET_TASKS_QUERY, { ids }, authToken);

    const items = result.itemsByIDs;
    const response: Record<string, unknown> = { items };
    if (taskIds.length > MAX_IDS) {
      response.warning = `Only the first ${MAX_IDS} of ${taskIds.length} requested IDs were fetched. Pass fewer IDs or make multiple calls.`;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  }

  private async searchTasks(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['findQuery', 'projectId'], 'search_tasks');
    const findQuery = args.findQuery as string;
    const projectId = args.projectId as string;
    const limit = this.searchLimit;

    const result = await this.graphqlClient.query<{
      items: Array<{
        id: string;
        name: string;
        subprojectPath: string;
        projectID: string;
        committedToProjectID?: string;
        status?: string;
        __typename: string;
      }>;
    }>(SEARCH_TASKS_QUERY, { id: projectId, findQuery, limit }, authToken);

    if (result.items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: 0,
              matches: [],
              message:
                'No items found. Check your findQuery syntax or try a broader query.',
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: result.items.length,
            matches: result.items,
          }),
        },
      ],
    };
  }

  private async createItem(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['type', 'name'], 'create_item');
    const type = args.type as string;

    switch (type) {
      case 'backlog_task':
        return this.createBacklogTask(args, authToken);
      case 'bug':
        return this.createBug(args, authToken);
      case 'scheduled_task':
        return this.createScheduledTask(args, authToken);
      case 'sprint':
        return this.createSprint(args, authToken);
      case 'release':
        return this.createRelease(args, authToken);
      case 'sprint_task':
        return this.createSprintTask(args, authToken);
      default:
        throw new Error(
          `create_item: unknown type '${type}'. Use one of: backlog_task, bug, scheduled_task, sprint, release, sprint_task`,
        );
    }
  }

  // -- Type-specific create handlers -----------------------------------------

  private async createBacklogTask(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'create_item(backlog_task)');
    const projectId = args.projectId as string;

    const projectResult = await this.graphqlClient.query<{
      project: { id: string; name: string; backlog: { id: string } };
    }>(GET_PROJECT_BACKLOG_QUERY, { id: projectId }, authToken);

    const taskInput: Record<string, unknown> = { name: args.name as string };
    if (args.priority) taskInput.backlogPriority = args.priority;
    if (args.parentItemId) taskInput.indentationLevel = 1;

    const vars: Record<string, unknown> = {
      projectID: projectResult.project.backlog.id,
      createBacklogTasksInput: [taskInput],
    };
    if (args.parentItemId) vars.previousItemID = args.parentItemId;
    else if (args.previousItemId) vars.previousItemID = args.previousItemId;

    const result = await this.graphqlClient.query<{
      createBacklogTasks: Array<{
        id: string;
        name: string;
        status: string;
        backlogPriority?: string;
      }>;
    }>(CREATE_BACKLOG_TASKS_MUTATION, vars, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Backlog task created successfully',
            task: result.createBacklogTasks[0],
          }),
        },
      ],
    };
  }

  private async createBug(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'create_item(bug)');
    const projectId = args.projectId as string;

    const projectResult = await this.graphqlClient.query<{
      project: { id: string; name: string; qa: { id: string } };
    }>(GET_PROJECT_QA_QUERY, { id: projectId }, authToken);

    const bugInput: Record<string, unknown> = { name: args.name as string };
    if (args.detailedDescription)
      bugInput.detailedDescription = args.detailedDescription;
    if (args.stepsToReproduce)
      bugInput.stepsToReproduce = args.stepsToReproduce;
    if (args.severity) bugInput.severity = args.severity;
    if (args.priority) bugInput.bugPriority = args.priority;

    const result = await this.graphqlClient.query<{
      createBugs: Array<{
        id: string;
        projectID: string;
        localID: number;
        name: string;
        status: string;
        severity: string;
        bugPriority: string;
        detailedDescription: string;
        stepsToReproduce: string;
        createdBy: { id: string; name: string };
        createdOn: string;
      }>;
    }>(
      CREATE_BUG_MUTATION,
      { projectID: projectResult.project.qa.id, createBugsInput: [bugInput] },
      authToken,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: `Bug created successfully in project "${projectResult.project.name}"`,
            bug: result.createBugs[0],
          }),
        },
      ],
    };
  }

  private async createScheduledTask(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'create_item(scheduled_task)');
    const projectId = args.projectId as string;

    const taskInput: Record<string, unknown> = { name: args.name as string };
    if (args.estimatedDays !== undefined)
      taskInput.estimatedDays = args.estimatedDays;
    if (args.start) taskInput.start = args.start;
    if (args.finish) taskInput.finish = args.finish;
    if (args.parentItemId) taskInput.indentationLevel = 1;

    const vars: Record<string, unknown> = {
      projectID: projectId,
      createScheduledTasksInput: [taskInput],
    };
    if (args.parentItemId) vars.previousItemID = args.parentItemId;
    else if (args.previousItemId) vars.previousItemID = args.previousItemId;

    const result = await this.graphqlClient.query<{
      createScheduledTasks: Array<{
        id: string;
        projectID: string;
        localID: number;
        name: string;
        status: string;
        estimatedDays: number;
        percentCompleted: number;
        createdBy: { id: string; name: string };
        createdOn: string;
      }>;
    }>(CREATE_SCHEDULED_TASK_MUTATION, vars, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Scheduled task created successfully',
            task: result.createScheduledTasks[0],
          }),
        },
      ],
    };
  }

  private async createSprint(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'create_item(sprint)');
    const projectId = args.projectId as string;

    const sprintInput: Record<string, unknown> = { name: args.name as string };
    if (args.start) sprintInput.start = args.start;
    if (args.finish) sprintInput.finish = args.finish;

    const vars: Record<string, unknown> = {
      projectID: projectId,
      createSprintInput: sprintInput,
    };
    if (args.parentItemId) {
      vars.previousItemID = args.parentItemId;
      sprintInput.indentationLevel = 1;
    } else if (args.previousItemId) {
      vars.previousItemID = args.previousItemId;
    }

    const result = await this.graphqlClient.query<{
      createSprint: {
        id: string;
        name: string;
        start: string;
        finish: string;
        duration: number;
        status: string;
        allocations: Array<{
          user: { id: string; name: string };
          percentageAllocation: number;
        }>;
      };
    }>(CREATE_SPRINT_MUTATION, vars, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Sprint created successfully',
            sprint: result.createSprint,
          }),
        },
      ],
    };
  }

  private async createRelease(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'create_item(release)');
    const projectId = args.projectId as string;

    const releaseInput: Record<string, unknown> = { name: args.name as string };
    if (args.date) releaseInput.date = args.date;

    const vars: Record<string, unknown> = {
      projectID: projectId,
      createReleaseInput: releaseInput,
    };
    if (args.previousItemId) vars.previousItemID = args.previousItemId;
    // parentItemId doesn't apply to releases (they're always top-level planning items)

    const result = await this.graphqlClient.query<{
      createRelease: {
        id: string;
        name: string;
        date?: string;
        status?: string;
      };
    }>(CREATE_RELEASE_MUTATION, vars, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Release created successfully',
            release: result.createRelease,
          }),
        },
      ],
    };
  }

  private async createSprintTask(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['sprintId'], 'create_item(sprint_task)');
    const sprintId = args.sprintId as string;

    const taskInput: Record<string, unknown> = { name: args.name as string };
    if (args.priority) taskInput.backlogPriority = args.priority;
    if (args.parentItemId) taskInput.indentationLevel = 1;

    const vars: Record<string, unknown> = {
      sprintID: sprintId,
      createSprintTasksInput: [taskInput],
    };
    if (args.parentItemId) vars.previousItemID = args.parentItemId;
    else if (args.previousItemId) vars.previousItemID = args.previousItemId;

    const result = await this.graphqlClient.query<{
      createSprintTasks: Array<{
        id: string;
        name: string;
        status: string;
        backlogPriority?: string;
      }>;
    }>(CREATE_SPRINT_TASKS_MUTATION, vars, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Sprint task created successfully',
            task: result.createSprintTasks[0],
          }),
        },
      ],
    };
  }

  private async updateTaskStatus(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'status'], 'update_task_status');
    const taskId = args.taskId as string;
    const status = args.status as string;

    // Get the task type first
    const taskType = await this.getTaskType(taskId, authToken);
    const input = { id: taskId, status };

    const { mutation, resultKey } = this.buildUpdateMutation(
      taskType,
      'id\n          name\n          status',
    );

    const result = await this.graphqlClient.query<
      Record<string, { id: string; name: string; status: string }>
    >(mutation, { input }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: `Updated ${taskType} status: ${JSON.stringify(result[resultKey])}`,
        },
      ],
    };
  }

  private async completeTask(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    return this.updateTaskStatus(
      { taskId: args.taskId, status: 'completed' },
      authToken,
    );
  }

  private async startTask(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    return this.updateTaskStatus(
      { taskId: args.taskId, status: 'inProgress' },
      authToken,
    );
  }

  private async updateItem(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['itemId'], 'update_item');
    const itemId = args.itemId as string;

    // Detect the item type
    const itemType = await this.getTaskType(itemId, authToken);

    switch (itemType) {
      case 'Sprint':
        return this.updateSprint(args, itemId, authToken);
      case 'Release':
        return this.updateRelease(args, itemId, authToken);
      default:
        return this.updateTask(args, itemId, itemType, authToken);
    }
  }

  // -- update_item: Sprint ---------------------------------------------------

  private async updateSprint(
    args: Record<string, unknown>,
    sprintId: string,
    authToken: string,
  ): Promise<McpToolResult> {
    const updateInput: Record<string, unknown> = { id: sprintId };

    if (args.name !== undefined) updateInput.name = args.name;
    if (args.start !== undefined) updateInput.start = args.start;
    if (args.finish !== undefined) updateInput.finish = args.finish;
    if (args.hidden !== undefined) updateInput.hidden = args.hidden;
    if (args.color !== undefined) updateInput.color = args.color;
    if (args.hyperlink !== undefined) updateInput.hyperlink = args.hyperlink;
    if (args.confidence !== undefined) updateInput.confidence = args.confidence;
    if (args.risk !== undefined) updateInput.risk = args.risk;
    if (args.releaseIDs !== undefined) updateInput.releaseIDs = args.releaseIDs;

    const allocations = args.allocations as
      | {
          users?: Array<{ userID: string; percentageAllocation?: number }>;
          allProjectMembers?: boolean;
        }
      | undefined;

    if (allocations) {
      const allocInput: Record<string, unknown> = {};
      if (allocations.users) {
        allocInput.users = allocations.users.map((user) => ({
          userID: user.userID,
          percentageAllocation: user.percentageAllocation ?? 100,
        }));
      } else {
        allocInput.users = [];
      }
      allocInput.groups = [];
      if (allocations.allProjectMembers !== undefined) {
        allocInput.allProjectMembers = allocations.allProjectMembers;
      }
      updateInput.allocations = allocInput;
    }

    const result = await this.graphqlClient.query<{
      updateSprint: {
        id: string;
        name: string;
        start: string;
        finish: string;
        duration: number;
        status: string;
        allocations: Array<{
          user: { id: string; name: string };
          percentageAllocation: number;
        }>;
      };
    }>(UPDATE_SPRINT_MUTATION, { updateSprintInput: updateInput }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Sprint updated successfully',
            sprint: result.updateSprint,
          }),
        },
      ],
    };
  }

  // -- update_item: Release --------------------------------------------------

  private async updateRelease(
    args: Record<string, unknown>,
    releaseId: string,
    authToken: string,
  ): Promise<McpToolResult> {
    const updateInput: Record<string, unknown> = { id: releaseId };

    if (args.name !== undefined) updateInput.name = args.name;
    if (args.date !== undefined) updateInput.date = args.date;
    if (args.hidden !== undefined) updateInput.hidden = args.hidden;
    if (args.color !== undefined) updateInput.color = args.color;
    if (args.hyperlink !== undefined) updateInput.hyperlink = args.hyperlink;

    const result = await this.graphqlClient.query<{
      updateRelease: {
        id: string;
        name: string;
        date?: string;
        hidden?: boolean;
      };
    }>(UPDATE_RELEASE_MUTATION, { updateReleaseInput: updateInput }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Release updated successfully',
            release: result.updateRelease,
          }),
        },
      ],
    };
  }

  // -- update_item: BacklogTask / Bug / ScheduledTask ------------------------

  private async updateTask(
    args: Record<string, unknown>,
    taskId: string,
    taskType: string,
    authToken: string,
  ): Promise<McpToolResult> {
    const input: Record<string, unknown> = { id: taskId };

    // -- Fields common to all task types --
    if (args.name !== undefined) input.name = args.name;
    if (args.status !== undefined) input.status = args.status;
    if (args.points !== undefined) input.points = args.points;
    if (args.estimatedDays !== undefined)
      input.estimatedDays = args.estimatedDays;
    if (args.hidden !== undefined) input.hidden = args.hidden;
    if (args.color !== undefined) input.color = args.color;
    if (args.hyperlink !== undefined) input.hyperlink = args.hyperlink;
    if (args.confidence !== undefined) input.confidence = args.confidence;
    if (args.risk !== undefined) input.risk = args.risk;
    if (args.workflowStatusId !== undefined)
      input.workflowStatusID = args.workflowStatusId;
    if (args.workflowID !== undefined) input.workflowID = args.workflowID;
    if (args.releaseIDs !== undefined) input.releaseIDs = args.releaseIDs;

    // Assignment: pass through assignedTo, defaulting percentageAllocation to 100
    if (args.assignedTo !== undefined) {
      const assignedTo = args.assignedTo as Array<{
        userID: string;
        percentageAllocation?: number;
      }>;
      input.assignedTo = assignedTo.map((entry) => ({
        userID: entry.userID,
        percentageAllocation: entry.percentageAllocation ?? 100,
      }));
    }

    // Priority field name differs by type
    if (args.priority !== undefined) {
      if (taskType === 'Bug') {
        input.bugPriority = args.priority;
      } else {
        input.backlogPriority = args.priority;
      }
    }

    // Percent completed is available on ScheduledTask only
    if (args.percentCompleted !== undefined) {
      if (taskType !== 'ScheduledTask') {
        throw new Error(
          'Only ScheduledTask supports percentCompleted (use workRemaining for BacklogTask/Bug)',
        );
      }
      input.percentCompleted = args.percentCompleted;
    }

    // Sprint priority is available on BacklogTask and Bug (when committed to sprint)
    if (args.sprintPriority !== undefined) {
      if (taskType === 'ScheduledTask') {
        throw new Error('ScheduledTask does not support sprintPriority');
      }
      input.sprintPriority = args.sprintPriority;
    }

    // Work remaining is available on BacklogTask and Bug
    if (args.workRemaining !== undefined) {
      if (taskType === 'ScheduledTask') {
        throw new Error(
          'ScheduledTask does not support workRemaining (use percentCompleted instead)',
        );
      }
      input.workRemaining = args.workRemaining;
    }

    // User story fields are available on BacklogTask and ScheduledTask
    if (args.isUserStory !== undefined) {
      if (taskType === 'Bug') {
        throw new Error('Bug does not support isUserStory');
      }
      input.isUserStory = args.isUserStory;
    }

    if (args.userStory !== undefined) {
      if (taskType === 'Bug') {
        throw new Error('Bug does not support userStory');
      }
      input.userStory = args.userStory;
    }

    // Bug-only fields
    if (args.detailedDescription !== undefined) {
      if (taskType !== 'Bug') {
        throw new Error('Only Bug supports detailedDescription');
      }
      input.detailedDescription = args.detailedDescription;
    }

    if (args.stepsToReproduce !== undefined) {
      if (taskType !== 'Bug') {
        throw new Error('Only Bug supports stepsToReproduce');
      }
      input.stepsToReproduce = args.stepsToReproduce;
    }

    if (args.severity !== undefined) {
      if (taskType !== 'Bug') {
        throw new Error('Only Bug supports severity');
      }
      input.severity = args.severity;
    }

    // BacklogTask & Bug: sprintID
    if (args.sprintID !== undefined) {
      if (taskType === 'ScheduledTask') {
        throw new Error('ScheduledTask does not support sprintID');
      }
      input.sprintID = args.sprintID;
    }

    // BacklogTask only: category, epic
    if (args.category !== undefined) {
      if (taskType !== 'BacklogTask') {
        throw new Error('Only BacklogTask supports category');
      }
      input.category = args.category;
    }

    if (args.epic !== undefined) {
      if (taskType !== 'BacklogTask') {
        throw new Error('Only BacklogTask supports epic');
      }
      input.epic = args.epic;
    }

    // ScheduledTask only: start, finish, subproject, outOfOfficeStatus
    if (args.start !== undefined) {
      if (taskType !== 'ScheduledTask') {
        throw new Error(
          'Only ScheduledTask supports start (for sprints use update_item on the Sprint directly)',
        );
      }
      input.start = args.start;
    }

    if (args.finish !== undefined) {
      if (taskType !== 'ScheduledTask') {
        throw new Error(
          'Only ScheduledTask supports finish (for sprints use update_item on the Sprint directly)',
        );
      }
      input.finish = args.finish;
    }

    if (args.subproject !== undefined) {
      if (taskType !== 'ScheduledTask') {
        throw new Error('Only ScheduledTask supports subproject');
      }
      input.subproject = args.subproject;
    }

    if (args.outOfOfficeStatus !== undefined) {
      if (taskType !== 'ScheduledTask') {
        throw new Error('Only ScheduledTask supports outOfOfficeStatus');
      }
      input.outOfOfficeStatus = args.outOfOfficeStatus;
    }

    // Return fields differ by type
    const assignedToFields = `assignedTo {
            user {
              id
              name
            }
          }`;
    const returnFieldsByType: Record<string, string> = {
      Bug: `id
          name
          status
          bugPriority
          sprintPriority
          severity
          workRemaining
          detailedDescription
          stepsToReproduce
          ${assignedToFields}
          workflowStatus {
            id
            name
          }`,
      ScheduledTask: `id
          name
          status
          backlogPriority
          points
          estimatedDays
          percentCompleted
          isUserStory
          userStory
          ${assignedToFields}
          workflowStatus {
            id
            name
          }`,
      BacklogTask: `id
          name
          status
          backlogPriority
          sprintPriority
          points
          estimatedDays
          workRemaining
          isUserStory
          userStory
          ${assignedToFields}
          workflowStatus {
            id
            name
          }`,
    };

    const returnFields =
      returnFieldsByType[taskType] || returnFieldsByType.BacklogTask;
    const { mutation, resultKey } = this.buildUpdateMutation(
      taskType,
      returnFields,
    );

    const result = await this.graphqlClient.query<Record<string, unknown>>(
      mutation,
      { input },
      authToken,
    );

    return {
      content: [
        {
          type: 'text',
          text: `Updated ${taskType}: ${JSON.stringify(result[resultKey])}`,
        },
      ],
    };
  }
}
