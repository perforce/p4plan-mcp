// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { UsersTools } from './users.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('UsersTools', () => {
  let tools: UsersTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new UsersTools(
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
      expect(names).toContain('get_current_user');
      expect(names).toContain('list_project_users');
      expect(names).toHaveLength(2);
    });

    it('should have correct input schemas', () => {
      const toolMap = tools.getTools();
      const getCurrentUser = toolMap.get('get_current_user')!;
      expect(getCurrentUser.definition.inputSchema.required).toBeUndefined();

      const listProjectUsers = toolMap.get('list_project_users')!;
      expect(listProjectUsers.definition.inputSchema.required).toEqual([
        'projectId',
      ]);
    });
  });

  describe('get_current_user', () => {
    it('should return current user info', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        authenticatedUser: {
          id: 'u-1',
          name: 'Alice',
          emailAddress: 'alice@example.com',
        },
      });

      const result = await callTool('get_current_user', {});
      const data = parseToolResult(result);

      expect(data.id).toBe('u-1');
      expect(data.name).toBe('Alice');
      expect(data.emailAddress).toBe('alice@example.com');
      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toEqual({});
      expect(token).toBe('test-token');
    });

    it('should handle user without email', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        authenticatedUser: { id: 'u-2', name: 'Bob' },
      });

      const result = await callTool('get_current_user', {});
      const data = parseToolResult(result);

      expect(data.id).toBe('u-2');
      expect(data.name).toBe('Bob');
      expect(data.emailAddress).toBeUndefined();
    });
  });

  describe('list_project_users', () => {
    const mockUsers = [
      {
        user: { id: 'u-1', name: 'Alice', emailAddress: 'alice@example.com' },
        accessRights: { isMainManager: true, limitedVisibility: false },
      },
      {
        user: { id: 'u-2', name: 'Bob', emailAddress: 'bob@example.com' },
        accessRights: { isMainManager: false, limitedVisibility: false },
      },
    ];

    it('should return project members', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        project: { id: 'p-1', name: 'Project Alpha', users: mockUsers },
      });

      const result = await callTool('list_project_users', { projectId: 'p-1' });
      const data =
        parseToolResult<
          { user: { name: string }; accessRights: { isMainManager: boolean } }[]
        >(result);

      expect(data).toHaveLength(2);
      expect(data[0].user.name).toBe('Alice');
      expect(data[0].accessRights.isMainManager).toBe(true);
      expect(data[1].user.name).toBe('Bob');
      const [, variables, token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(variables).toEqual({ id: 'p-1' });
      expect(token).toBe('test-token');
    });

    it('should return empty list for project with no members', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        project: { id: 'p-2', name: 'Empty Project', users: [] },
      });

      const result = await callTool('list_project_users', { projectId: 'p-2' });
      const data = parseToolResult<unknown[]>(result);

      expect(data).toHaveLength(0);
    });

    it('should throw when projectId is missing', async () => {
      await expect(callTool('list_project_users', {})).rejects.toThrow(
        'projectId',
      );
    });
  });
});
