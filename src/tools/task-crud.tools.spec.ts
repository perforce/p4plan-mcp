// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskCrudTools } from './task-crud.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  getLastQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { ConfigService } from '@nestjs/config';

describe('TaskCrudTools', () => {
  let tools: TaskCrudTools;
  let mockGraphqlClient: MockGraphQLClient;
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'searchLimit') return 400;
        return undefined;
      }),
    };

    tools = new TaskCrudTools(
      mockGraphqlClient as unknown as GraphQLClientService,
      mockConfigService as unknown as ConfigService,
    );
  });

  /** Helper to invoke a handler by tool name */
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
      const toolMap = tools.getTools();
      const names = Array.from(toolMap.keys());

      expect(names).toContain('get_tasks');
      expect(names).toContain('search_tasks');
      expect(names).toContain('create_item');
      expect(names).toContain('update_item');
      expect(names).toContain('complete_task');
      expect(names).toContain('start_task');
      expect(names).toHaveLength(6);
    });

    it('all tools should have valid inputSchema', () => {
      const toolMap = tools.getTools();
      toolMap.forEach((tool) => {
        expect(tool.definition.inputSchema.type).toBe('object');
        expect(tool.definition.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe('get_tasks', () => {
    it('should return task details for a single ID', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        itemsByIDs: [
          {
            id: 'task-1',
            name: 'Test Task',
            projectID: 'proj-1',
            status: 'notDone',
            createdOn: '2026-01-01',
            lastUpdatedOn: '2026-01-02',
          },
        ],
      });

      const result = await callTool('get_tasks', { taskIds: ['task-1'] });

      expect(result.content[0].type).toBe('text');
      const data = parseToolResult<{ items: Array<Record<string, unknown>> }>(
        result,
      );
      expect(data.items).toHaveLength(1);
      expect(data.items[0].id).toBe('task-1');
      expect(data.items[0].name).toBe('Test Task');
    });

    it('should return details for multiple IDs', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        itemsByIDs: [
          {
            id: 'task-1',
            name: 'Task One',
            projectID: 'p-1',
            createdOn: '2026-01-01',
            lastUpdatedOn: '2026-01-02',
          },
          {
            id: 'task-2',
            name: 'Task Two',
            projectID: 'p-1',
            createdOn: '2026-01-01',
            lastUpdatedOn: '2026-01-02',
          },
        ],
      });

      const result = await callTool('get_tasks', {
        taskIds: ['task-1', 'task-2'],
      });
      const data = parseToolResult<{ items: Array<Record<string, unknown>> }>(
        result,
      );
      expect(data.items).toHaveLength(2);
    });

    it('should cap at 20 IDs and include a warning', async () => {
      const manyIds = Array.from({ length: 25 }, (_, i) => `task-${i}`);
      mockGraphqlClient.query.mockResolvedValue({
        itemsByIDs: manyIds.slice(0, 20).map((id) => ({
          id,
          name: id,
          projectID: 'p-1',
          createdOn: '',
          lastUpdatedOn: '',
        })),
      });

      const result = await callTool('get_tasks', { taskIds: manyIds });
      const data = parseToolResult<{
        items: Array<Record<string, unknown>>;
        warning?: string;
      }>(result);

      // Should only pass first 20 to the API
      const [, variables] = getQueryCall(mockGraphqlClient.query, 0);
      expect((variables.ids as string[]).length).toBe(20);

      // Should include a warning about truncation
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain('20');
    });

    it('should throw when taskIds is missing', async () => {
      await expect(callTool('get_tasks', {})).rejects.toThrow(
        "get_tasks: 'taskIds' is required",
      );
    });

    it('should throw when taskIds is empty', async () => {
      await expect(callTool('get_tasks', { taskIds: [] })).rejects.toThrow(
        "get_tasks: 'taskIds' must be a non-empty array",
      );
    });
  });

  describe('search_tasks', () => {
    it('should search via findQuery and return matches', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        items: [
          {
            id: 't-1',
            name: 'Login page bug',
            projectID: 'proj-1',
            subprojectPath: '',
            status: 'notDone',
            __typename: 'Bug',
          },
        ],
      });

      const result = await callTool('search_tasks', {
        findQuery: 'Itemname:Text("login")',
        projectId: 'proj-1',
      });
      const data = parseToolResult<{
        count: number;
        matches: Array<{ id: string; projectID: string }>;
      }>(result);

      expect(data.count).toBe(1);
      expect(data.matches).toHaveLength(1);
      expect(data.matches[0].id).toBe('t-1');
      expect(data.matches[0].projectID).toBe('proj-1');

      const [, vars, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(vars).toMatchObject({
        id: 'proj-1',
        findQuery: 'Itemname:Text("login")',
        limit: 400,
      });
      expect(token).toBe('test-token');
    });

    it('should always query with limit 400', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        items: [
          {
            id: 't-1',
            name: 'Match one',
            projectID: 'proj-1',
            subprojectPath: '',
            status: 'notDone',
            __typename: 'BacklogTask',
          },
          {
            id: 't-2',
            name: 'Match two',
            projectID: 'proj-1',
            subprojectPath: '',
            status: 'notDone',
            __typename: 'BacklogTask',
          },
        ],
      });

      const result = await callTool('search_tasks', {
        findQuery: 'Itemname:Text("match")',
        projectId: 'proj-1',
      });
      const data = parseToolResult<{ count: number; matches: unknown[] }>(
        result,
      );

      expect(data.count).toBe(2);
      expect(data.matches).toHaveLength(2);

      const [, vars] = getQueryCall(mockGraphqlClient.query, 0);
      expect(vars).toMatchObject({ id: 'proj-1', limit: 400 });
    });

    it('should pass findQuery directly to the GraphQL query', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        items: [],
      });

      await callTool('search_tasks', {
        findQuery: 'Itemtype="Bug" AND Status="Not done"',
        projectId: 'proj-1',
      });

      const [, vars] = getQueryCall(mockGraphqlClient.query, 0);
      expect(vars).toMatchObject({
        findQuery: 'Itemtype="Bug" AND Status="Not done"',
      });
    });

    it('should return empty matches with message when no items found', async () => {
      mockGraphqlClient.query.mockResolvedValue({ items: [] });

      const result = await callTool('search_tasks', {
        findQuery: 'Itemname:Text("nothing")',
        projectId: 'proj-1',
      });
      const data = parseToolResult<{
        count: number;
        matches: unknown[];
        message: string;
      }>(result);

      expect(data.count).toBe(0);
      expect(data.matches).toHaveLength(0);
      expect(data.message).toContain('No items found');
    });

    it('should throw when findQuery is missing', async () => {
      await expect(
        callTool('search_tasks', { projectId: 'proj-1' }),
      ).rejects.toThrow("search_tasks: 'findQuery' is required");
    });

    it('should throw when projectId is missing', async () => {
      await expect(
        callTool('search_tasks', { findQuery: 'Itemname:Text("test")' }),
      ).rejects.toThrow("search_tasks: 'projectId' is required");
    });
  });

  describe('create_item', () => {
    it('should throw when type is missing', async () => {
      await expect(callTool('create_item', { name: 'Foo' })).rejects.toThrow(
        "create_item: 'type' is required",
      );
    });

    it('should throw when name is missing', async () => {
      await expect(callTool('create_item', { type: 'bug' })).rejects.toThrow(
        "create_item: 'name' is required",
      );
    });

    it('should throw on unknown type', async () => {
      await expect(
        callTool('create_item', { type: 'invalid', name: 'X' }),
      ).rejects.toThrow("create_item: unknown type 'invalid'");
    });

    describe('type=backlog_task', () => {
      it('should create a backlog task', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({
            project: { id: 'proj-1', name: 'Project', backlog: { id: 'bl-1' } },
          })
          .mockResolvedValueOnce({
            createBacklogTasks: [
              { id: 'new-1', name: 'New Task', status: 'notDone' },
            ],
          });

        const result = await callTool('create_item', {
          type: 'backlog_task',
          projectId: 'proj-1',
          name: 'New Task',
        });

        const data = parseToolResult(result);
        expect(data.message).toContain('Backlog task created successfully');

        const [, createVars, createToken] = getQueryCall(
          mockGraphqlClient.query,
          1,
        );
        expect(createVars).toMatchObject({
          projectID: 'bl-1',
          createBacklogTasksInput: [{ name: 'New Task' }],
        });
        expect(createToken).toBe('test-token');
      });

      it('should pass priority as backlogPriority', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({
            project: { id: 'proj-1', name: 'P', backlog: { id: 'bl-1' } },
          })
          .mockResolvedValueOnce({
            createBacklogTasks: [
              {
                id: 'new-1',
                name: 'Task',
                status: 'notDone',
                backlogPriority: 'high',
              },
            ],
          });

        await callTool('create_item', {
          type: 'backlog_task',
          projectId: 'proj-1',
          name: 'Task',
          priority: 'high',
        });

        const [, vars] = getQueryCall(mockGraphqlClient.query, 1);
        expect(vars).toMatchObject({
          createBacklogTasksInput: [{ name: 'Task', backlogPriority: 'high' }],
        });
      });

      it('should throw when projectId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'backlog_task', name: 'Task' }),
        ).rejects.toThrow("create_item(backlog_task): 'projectId' is required");
      });
    });

    describe('type=bug', () => {
      it('should create a bug by resolving the QA section', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({
            project: { id: 'proj-1', name: 'Project', qa: { id: 'qa-1' } },
          })
          .mockResolvedValueOnce({
            createBugs: [
              {
                id: 'bug-1',
                projectID: 'qa-1',
                localID: 42,
                name: 'UI crash',
                status: 'notDone',
                severity: 'A',
                bugPriority: 'high',
                detailedDescription: 'Crashes on click',
                stepsToReproduce: '1. Click button',
                createdBy: { id: 'u-1', name: 'Alice' },
                createdOn: '2026-02-20',
              },
            ],
          });

        const result = await callTool('create_item', {
          type: 'bug',
          projectId: 'proj-1',
          name: 'UI crash',
          detailedDescription: 'Crashes on click',
          stepsToReproduce: '1. Click button',
          severity: 'A',
          priority: 'high',
        });

        const data = parseToolResult(result);
        expect(data.message).toContain('Bug created successfully');
        expect((data.bug as { name: string }).name).toBe('UI crash');

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          projectID: 'qa-1',
          createBugsInput: [
            { name: 'UI crash', severity: 'A', bugPriority: 'high' },
          ],
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should create a bug with minimal args', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({
            project: { id: 'proj-1', name: 'Project', qa: { id: 'qa-1' } },
          })
          .mockResolvedValueOnce({
            createBugs: [
              {
                id: 'bug-2',
                projectID: 'qa-1',
                localID: 43,
                name: 'Minor issue',
                status: 'notDone',
                severity: 'none',
                bugPriority: 'none',
                detailedDescription: '',
                stepsToReproduce: '',
                createdBy: { id: 'u-1', name: 'Alice' },
                createdOn: '2026-02-20',
              },
            ],
          });

        const result = await callTool('create_item', {
          type: 'bug',
          projectId: 'proj-1',
          name: 'Minor issue',
        });
        const data = parseToolResult<{ bug: { name: string } }>(result);
        expect(data.bug.name).toBe('Minor issue');
      });

      it('should throw when projectId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'bug', name: 'Bug' }),
        ).rejects.toThrow("create_item(bug): 'projectId' is required");
      });
    });

    describe('type=scheduled_task', () => {
      it('should create a scheduled task with all fields', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createScheduledTasks: [
            {
              id: 'st-1',
              projectID: 'proj-1',
              localID: 10,
              name: 'Design Phase',
              status: 'notDone',
              estimatedDays: 5,
              percentCompleted: 0,
              createdBy: { id: 'u-1', name: 'Alice' },
              createdOn: '2026-02-20',
            },
          ],
        });

        const result = await callTool('create_item', {
          type: 'scheduled_task',
          projectId: 'proj-1',
          name: 'Design Phase',
          estimatedDays: 5,
          start: '2026-03-01',
          finish: '2026-03-05',
        });

        const data = parseToolResult<{ task: { name: string } }>(result);
        expect(data.task.name).toBe('Design Phase');

        const [, vars, token] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          projectID: 'proj-1',
          createScheduledTasksInput: [
            {
              name: 'Design Phase',
              estimatedDays: 5,
              start: '2026-03-01',
              finish: '2026-03-05',
            },
          ],
        });
        expect(token).toBe('test-token');
      });

      it('should throw when projectId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'scheduled_task', name: 'Task' }),
        ).rejects.toThrow(
          "create_item(scheduled_task): 'projectId' is required",
        );
      });
    });

    describe('type=sprint', () => {
      it('should create a sprint with name and dates', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createSprint: {
            id: 's-new',
            name: 'Sprint 10',
            start: '2026-03-01',
            finish: '2026-03-14',
            duration: 10,
            status: 'notDone',
            allocations: [],
          },
        });

        const result = await callTool('create_item', {
          type: 'sprint',
          projectId: 'p-1',
          name: 'Sprint 10',
          start: '2026-03-01',
          finish: '2026-03-14',
        });

        const data = parseToolResult<{ sprint: { id: string; name: string } }>(
          result,
        );
        expect(data.sprint.id).toBe('s-new');
        expect(data.sprint.name).toBe('Sprint 10');

        const [, vars, token] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          projectID: 'p-1',
          createSprintInput: {
            name: 'Sprint 10',
            start: '2026-03-01',
            finish: '2026-03-14',
          },
        });
        expect(token).toBe('test-token');
      });

      it('should create a sprint with just a name', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createSprint: {
            id: 's-2',
            name: 'Sprint 11',
            start: '2026-03-15',
            finish: '2026-03-28',
            duration: 10,
            status: 'notDone',
            allocations: [],
          },
        });

        await callTool('create_item', {
          type: 'sprint',
          projectId: 'p-1',
          name: 'Sprint 11',
        });

        const [, vars] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          createSprintInput: { name: 'Sprint 11' },
        });
      });

      it('should throw when projectId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'sprint', name: 'S' }),
        ).rejects.toThrow("create_item(sprint): 'projectId' is required");
      });
    });

    describe('type=release', () => {
      it('should create a release with name and date', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createRelease: {
            id: 'r-1',
            name: 'v2.4',
            date: '2026-06-01',
            status: 'notDone',
          },
        });

        const result = await callTool('create_item', {
          type: 'release',
          projectId: 'p-1',
          name: 'v2.4',
          date: '2026-06-01',
        });

        const data = parseToolResult<{ release: { id: string; name: string } }>(
          result,
        );
        expect(data.release.id).toBe('r-1');
        expect(data.release.name).toBe('v2.4');

        const [, vars, token] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          projectID: 'p-1',
          createReleaseInput: { name: 'v2.4', date: '2026-06-01' },
        });
        expect(token).toBe('test-token');
      });

      it('should create a release with just a name', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createRelease: { id: 'r-2', name: 'v3.0' },
        });

        await callTool('create_item', {
          type: 'release',
          projectId: 'p-1',
          name: 'v3.0',
        });

        const [, vars] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({ createReleaseInput: { name: 'v3.0' } });
      });

      it('should throw when projectId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'release', name: 'v1' }),
        ).rejects.toThrow("create_item(release): 'projectId' is required");
      });
    });

    describe('type=sprint_task', () => {
      it('should create a task directly in a sprint', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createSprintTasks: [
            {
              id: 'st-1',
              name: 'Sprint Task',
              status: 'notDone',
              backlogPriority: 'none',
            },
          ],
        });

        const result = await callTool('create_item', {
          type: 'sprint_task',
          sprintId: 's-1',
          name: 'Sprint Task',
        });

        const data = parseToolResult<{ task: { name: string } }>(result);
        expect(data.task.name).toBe('Sprint Task');

        const [, vars, token] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          sprintID: 's-1',
          createSprintTasksInput: [{ name: 'Sprint Task' }],
        });
        expect(token).toBe('test-token');
      });

      it('should pass priority as backlogPriority', async () => {
        mockGraphqlClient.query.mockResolvedValue({
          createSprintTasks: [
            {
              id: 'st-2',
              name: 'Prio',
              status: 'notDone',
              backlogPriority: 'high',
            },
          ],
        });

        await callTool('create_item', {
          type: 'sprint_task',
          sprintId: 's-1',
          name: 'Prio',
          priority: 'high',
        });

        const [, vars] = getQueryCall(mockGraphqlClient.query, 0);
        expect(vars).toMatchObject({
          createSprintTasksInput: [{ name: 'Prio', backlogPriority: 'high' }],
        });
      });

      it('should throw when sprintId is missing', async () => {
        await expect(
          callTool('create_item', { type: 'sprint_task', name: 'Task' }),
        ).rejects.toThrow("create_item(sprint_task): 'sprintId' is required");
      });
    });
  });

  describe('complete_task', () => {
    it('should delegate to updateTaskStatus with status=completed', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { __typename: 'Bug' } })
        .mockResolvedValueOnce({
          updateBug: { id: 'bug-1', name: 'Bug', status: 'completed' },
        });

      const result = await callTool('complete_task', { taskId: 'bug-1' });

      expect(result.content[0].text).toContain('completed');
    });
  });

  describe('start_task', () => {
    it('should delegate to updateTaskStatus with status=inProgress', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { __typename: 'ScheduledTask' } })
        .mockResolvedValueOnce({
          updateScheduledTask: { id: 'st-1', name: 'ST', status: 'inProgress' },
        });

      const result = await callTool('start_task', { taskId: 'st-1' });

      expect(result.content[0].text).toContain('inProgress');
    });
  });

  describe('update_item', () => {
    it('should throw when itemId is missing', async () => {
      await expect(callTool('update_item', { name: 'foo' })).rejects.toThrow(
        "update_item: 'itemId' is required",
      );
    });

    describe('BacklogTask / Bug / ScheduledTask', () => {
      it('should update basic fields on a BacklogTask', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'BacklogTask' } })
          .mockResolvedValueOnce({
            updateBacklogTask: {
              id: 't-1',
              name: 'Renamed',
              status: 'notDone',
              backlogPriority: 'high',
            },
          });

        const result = await callTool('update_item', {
          itemId: 't-1',
          name: 'Renamed',
          priority: 'high',
        });

        const text = result.content[0].text!;
        expect(text).toContain('Renamed');
        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[0]).toContain('UpdateBacklogTask');
        expect(lastCall[1]).toMatchObject({
          input: { id: 't-1', name: 'Renamed', backlogPriority: 'high' },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should use bugPriority for Bug type', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Bug' } })
          .mockResolvedValueOnce({
            updateBug: { id: 'b-1', name: 'Bug', bugPriority: 'high' },
          });

        await callTool('update_item', { itemId: 'b-1', priority: 'high' });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[0]).toContain('UpdateBug');
        expect(lastCall[1]).toMatchObject({
          input: { bugPriority: 'high' },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should allow percentCompleted on ScheduledTask', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'ScheduledTask' } })
          .mockResolvedValueOnce({
            updateScheduledTask: {
              id: 'st-1',
              name: 'ST',
              percentCompleted: 50,
            },
          });

        const result = await callTool('update_item', {
          itemId: 'st-1',
          percentCompleted: 50,
        });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({ input: { percentCompleted: 50 } });
        expect(lastCall[2]).toBe('test-token');
        expect(result.content[0].text).toContain('50');
      });

      it('should reject percentCompleted on Bug', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'Bug' },
        });
        await expect(
          callTool('update_item', { itemId: 'b-1', percentCompleted: 50 }),
        ).rejects.toThrow('Only ScheduledTask supports percentCompleted');
      });

      it('should reject percentCompleted on BacklogTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'BacklogTask' },
        });
        await expect(
          callTool('update_item', { itemId: 't-1', percentCompleted: 50 }),
        ).rejects.toThrow('Only ScheduledTask supports percentCompleted');
      });

      it('should allow severity on Bug', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Bug' } })
          .mockResolvedValueOnce({
            updateBug: { id: 'b-1', name: 'Bug', severity: 'A' },
          });
        await callTool('update_item', { itemId: 'b-1', severity: 'A' });
        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({ input: { severity: 'A' } });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should reject severity on BacklogTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'BacklogTask' },
        });
        await expect(
          callTool('update_item', { itemId: 't-1', severity: 'A' }),
        ).rejects.toThrow('Only Bug supports severity');
      });

      it('should reject severity on ScheduledTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'ScheduledTask' },
        });
        await expect(
          callTool('update_item', { itemId: 'st-1', severity: 'A' }),
        ).rejects.toThrow('Only Bug supports severity');
      });

      it('should reject sprintPriority on ScheduledTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'ScheduledTask' },
        });
        await expect(
          callTool('update_item', { itemId: 'st-1', sprintPriority: 'high' }),
        ).rejects.toThrow('ScheduledTask does not support sprintPriority');
      });

      it('should reject workRemaining on ScheduledTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'ScheduledTask' },
        });
        await expect(
          callTool('update_item', { itemId: 'st-1', workRemaining: 5 }),
        ).rejects.toThrow('ScheduledTask does not support workRemaining');
      });

      it('should reject isUserStory on Bug', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'Bug' },
        });
        await expect(
          callTool('update_item', { itemId: 'b-1', isUserStory: true }),
        ).rejects.toThrow('Bug does not support isUserStory');
      });

      it('should reject userStory on Bug', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'Bug' },
        });
        await expect(
          callTool('update_item', { itemId: 'b-1', userStory: 'As a user...' }),
        ).rejects.toThrow('Bug does not support userStory');
      });

      it('should reject detailedDescription on BacklogTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'BacklogTask' },
        });
        await expect(
          callTool('update_item', {
            itemId: 't-1',
            detailedDescription: 'desc',
          }),
        ).rejects.toThrow('Only Bug supports detailedDescription');
      });

      it('should reject stepsToReproduce on ScheduledTask', async () => {
        mockGraphqlClient.query.mockResolvedValueOnce({
          item: { __typename: 'ScheduledTask' },
        });
        await expect(
          callTool('update_item', {
            itemId: 'st-1',
            stepsToReproduce: 'steps',
          }),
        ).rejects.toThrow('Only Bug supports stepsToReproduce');
      });

      it('should set workflowStatusID from workflowStatusId arg', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'BacklogTask' } })
          .mockResolvedValueOnce({
            updateBacklogTask: {
              id: 't-1',
              name: 'Task',
              workflowStatus: { id: 'ws-1', name: 'Review' },
            },
          });

        await callTool('update_item', {
          itemId: 't-1',
          workflowStatusId: 'ws-1',
        });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          input: { workflowStatusID: 'ws-1' },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should assign a task to users via assignedTo', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'BacklogTask' } })
          .mockResolvedValueOnce({
            updateBacklogTask: {
              id: 't-1',
              name: 'Task',
              assignedTo: [{ user: { id: 'u-1', name: 'Alice' } }],
            },
          });

        const result = await callTool('update_item', {
          itemId: 't-1',
          assignedTo: [{ userID: 'u-1' }],
        });
        expect(result.content[0].text).toContain('Alice');

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          input: {
            assignedTo: [{ userID: 'u-1', percentageAllocation: 100 }],
          },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should assign multiple users with custom allocation', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Bug' } })
          .mockResolvedValueOnce({
            updateBug: {
              id: 'b-1',
              name: 'Bug',
              assignedTo: [
                { user: { id: 'u-1', name: 'Alice' } },
                { user: { id: 'u-2', name: 'Bob' } },
              ],
            },
          });

        await callTool('update_item', {
          itemId: 'b-1',
          assignedTo: [
            { userID: 'u-1', percentageAllocation: 50 },
            { userID: 'u-2', percentageAllocation: 75 },
          ],
        });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          input: {
            assignedTo: [
              { userID: 'u-1', percentageAllocation: 50 },
              { userID: 'u-2', percentageAllocation: 75 },
            ],
          },
        });
      });
    });

    describe('Sprint', () => {
      it('should update sprint name and dates', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Sprint' } })
          .mockResolvedValueOnce({
            updateSprint: {
              id: 's-1',
              name: 'Sprint 5',
              start: '2026-03-01',
              finish: '2026-03-14',
              duration: 14,
              status: 'notDone',
              allocations: [],
            },
          });

        const result = await callTool('update_item', {
          itemId: 's-1',
          name: 'Sprint 5',
          start: '2026-03-01',
          finish: '2026-03-14',
        });

        const data = parseToolResult<{ sprint: { name: string } }>(result);
        expect(data.sprint.name).toBe('Sprint 5');
      });

      it('should update sprint with user allocations', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Sprint' } })
          .mockResolvedValueOnce({
            updateSprint: {
              id: 's-1',
              name: 'Sprint 5',
              start: '2026-03-01',
              finish: '2026-03-14',
              duration: 14,
              status: 'notDone',
              allocations: [
                {
                  user: { id: 'u-1', name: 'Alice' },
                  percentageAllocation: 75,
                },
              ],
            },
          });

        await callTool('update_item', {
          itemId: 's-1',
          allocations: {
            users: [{ userID: 'u-1', percentageAllocation: 75 }],
          },
        });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          updateSprintInput: {
            id: 's-1',
            allocations: {
              users: [{ userID: 'u-1', percentageAllocation: 75 }],
              groups: [],
            },
          },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should default percentageAllocation to 100 when not specified', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Sprint' } })
          .mockResolvedValueOnce({
            updateSprint: {
              id: 's-1',
              name: 'Sprint',
              start: '',
              finish: '',
              duration: 0,
              status: 'notDone',
              allocations: [],
            },
          });

        await callTool('update_item', {
          itemId: 's-1',
          allocations: { users: [{ userID: 'u-2' }] },
        });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          updateSprintInput: {
            allocations: {
              users: [{ userID: 'u-2', percentageAllocation: 100 }],
            },
          },
        });
        expect(lastCall[2]).toBe('test-token');
      });
    });

    describe('Release', () => {
      it('should update release name and date', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Release' } })
          .mockResolvedValueOnce({
            updateRelease: {
              id: 'r-1',
              name: 'v2.5',
              date: '2026-06-15',
              hidden: false,
            },
          });

        const result = await callTool('update_item', {
          itemId: 'r-1',
          name: 'v2.5',
          date: '2026-06-15',
        });

        const data = parseToolResult<{ release: { name: string } }>(result);
        expect(data.release.name).toBe('v2.5');

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          updateReleaseInput: { id: 'r-1', name: 'v2.5', date: '2026-06-15' },
        });
        expect(lastCall[2]).toBe('test-token');
      });

      it('should update release hidden status', async () => {
        mockGraphqlClient.query
          .mockResolvedValueOnce({ item: { __typename: 'Release' } })
          .mockResolvedValueOnce({
            updateRelease: {
              id: 'r-1',
              name: 'v2.4',
              date: '2026-06-01',
              hidden: true,
            },
          });

        await callTool('update_item', { itemId: 'r-1', hidden: true });

        const lastCall = getLastQueryCall(mockGraphqlClient.query);
        expect(lastCall[1]).toMatchObject({
          updateReleaseInput: { id: 'r-1', hidden: true },
        });
        expect(lastCall[2]).toBe('test-token');
      });
    });
  });
});
