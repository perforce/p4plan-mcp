// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskItemsTools } from './task-items.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('TaskItemsTools', () => {
  let tools: TaskItemsTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new TaskItemsTools(
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
      expect(names).toContain('get_my_tasks');
      expect(names).toHaveLength(1);
    });
  });

  describe('get_my_tasks', () => {
    it('should return tasks assigned to current user', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        todoList: [
          {
            id: 't-1',
            name: 'Fix login',
            projectID: 'p-1',
            status: 'inProgress',
            backlogPriority: 'high',
            estimatedDays: 3,
          },
          {
            id: 't-2',
            name: 'Write tests',
            projectID: 'p-1',
            status: 'notDone',
            backlogPriority: 'medium',
          },
        ],
      });

      const result = await callTool('get_my_tasks', {});
      const data = parseToolResult<{
        count: number;
        tasks: { name: string; priority: string }[];
      }>(result);

      expect(data.count).toBe(2);
      expect(data.tasks[0].name).toBe('Fix login');
      expect(data.tasks[0].priority).toBe('high');
      expect(data.tasks[1].name).toBe('Write tests');
    });

    it('should pass showCompleted option to query', async () => {
      mockGraphqlClient.query.mockResolvedValue({ todoList: [] });

      await callTool('get_my_tasks', { showCompleted: true });

      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toMatchObject({ showOptions: { showCompleted: true } });
      expect(token).toBe('test-token');
    });

    it('should default showCompleted to false', async () => {
      mockGraphqlClient.query.mockResolvedValue({ todoList: [] });

      await callTool('get_my_tasks', {});

      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toMatchObject({
        showOptions: { showCompleted: false },
      });
      expect(token).toBe('test-token');
    });

    it('should pass showHidden option to query', async () => {
      mockGraphqlClient.query.mockResolvedValue({ todoList: [] });

      await callTool('get_my_tasks', { showHidden: true });

      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toMatchObject({ showOptions: { showHidden: true } });
      expect(token).toBe('test-token');
    });

    it('should pass showPipelineTasksThatCannotStart option to query', async () => {
      mockGraphqlClient.query.mockResolvedValue({ todoList: [] });

      await callTool('get_my_tasks', {
        showPipelineTasksThatCannotStart: true,
      });

      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toMatchObject({
        showOptions: { showPipelineTasksThatCannotStart: true },
      });
      expect(token).toBe('test-token');
    });

    it('should map todoList fields to output format', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        todoList: [
          {
            id: 't-1',
            name: 'Task',
            projectID: 'p-1',
            status: 'inProgress',
            backlogPriority: 'high',
            sprintPriority: 'medium',
            severity: 'B',
            confidence: 'high',
            risk: 'low',
            duration: 5,
            estimatedDays: 3,
            percentCompleted: 40,
            workRemaining: 8,
            isUserStory: true,
            userStory: 'As a user...',
            workflow: { id: 'wf-1', name: 'Dev' },
            workflowStatus: { id: 'ws-1', name: 'In Review' },
          },
        ],
      });

      const result = await callTool('get_my_tasks', {});
      const data = parseToolResult<{
        tasks: {
          priority: string;
          sprintPriority: string;
          severity: string;
          isUserStory: boolean;
          workflowStatus: { name: string };
        }[];
      }>(result);
      const task = data.tasks[0];

      expect(task.priority).toBe('high');
      expect(task.sprintPriority).toBe('medium');
      expect(task.severity).toBe('B');
      expect(task.isUserStory).toBe(true);
      expect(task.workflowStatus.name).toBe('In Review');
    });
  });
});
