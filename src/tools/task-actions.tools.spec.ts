// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskActionsTools } from './task-actions.tools';
import { McpToolResult } from './tools.service';
import { getQueryCall, MockGraphQLClient } from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('TaskActionsTools', () => {
  let tools: TaskActionsTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new TaskActionsTools(
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
      expect(names).toContain('commit_to_sprint');
      expect(names).toContain('uncommit_from_sprint');
      expect(names).toHaveLength(2);
    });
  });

  describe('commit_to_sprint', () => {
    it('should commit a task to a sprint', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        commitToSprint: { id: 't-1', name: 'Task' },
      });

      const result = await callTool('commit_to_sprint', {
        taskId: 't-1',
        sprintId: 's-1',
      });
      const text = result.content[0].text!;
      expect(text).toContain('Committed task to sprint');

      const [, commitVars, commitToken] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(commitVars).toEqual({ taskID: 't-1', sprintID: 's-1' });
      expect(commitToken).toBe('test-token');
    });

    it('should throw when taskId is missing', async () => {
      await expect(
        callTool('commit_to_sprint', { sprintId: 's-1' }),
      ).rejects.toThrow("commit_to_sprint: 'taskId' is required");
    });

    it('should throw when sprintId is missing', async () => {
      await expect(
        callTool('commit_to_sprint', { taskId: 't-1' }),
      ).rejects.toThrow("commit_to_sprint: 'sprintId' is required");
    });
  });

  describe('uncommit_from_sprint', () => {
    it('should uncommit a task from its sprint', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        uncommitFromSprint: { id: 't-1', name: 'Task' },
      });

      const result = await callTool('uncommit_from_sprint', { taskId: 't-1' });

      expect(result.content[0].text).toContain('Uncommitted task from sprint');
      expect(result.content[0].text).toContain('t-1');
    });

    it('should throw when taskId is missing', async () => {
      await expect(callTool('uncommit_from_sprint', {})).rejects.toThrow(
        "uncommit_from_sprint: 'taskId' is required",
      );
    });
  });
});
