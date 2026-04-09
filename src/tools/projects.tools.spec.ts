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
      expect(names).toHaveLength(2);
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
});
