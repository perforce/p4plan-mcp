// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';
import { ProjectsTools } from './projects.tools';
import { UsersTools } from './users.tools';
import { TasksTools } from './tasks.tools';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { MockGraphQLClient } from '../test-utils';
import { SkillsTools } from './skills.tools';
import { ConfigService } from '@nestjs/config';

describe('ToolsService', () => {
  let service: ToolsService;
  let mockGraphqlClient: MockGraphQLClient;
  let mockLogger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsService,
        ProjectsTools,
        UsersTools,
        TasksTools,
        SkillsTools,
        { provide: GraphQLClientService, useValue: mockGraphqlClient },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'searchLimit' ? 400 : undefined,
            ),
          },
        },
        { provide: 'LOGGER', useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ToolsService>(ToolsService);
  });

  describe('listTools', () => {
    it('should return an array of tool definitions', () => {
      const tools = service.listTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include expected core tools', () => {
      const tools = service.listTools();
      const toolNames = tools.map((tool) => tool.name);

      // Project tools
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_project');

      // User tools
      expect(toolNames).toContain('get_current_user');
      expect(toolNames).toContain('list_project_users');

      // Task tools
      expect(toolNames).toContain('get_tasks');
      expect(toolNames).toContain('create_item');
      expect(toolNames).toContain('update_item');
      expect(toolNames).toContain('get_my_tasks');
    });

    it('should have valid schema for each tool', () => {
      const tools = service.listTools();

      tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);

        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');

        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it('should have required fields specified correctly', () => {
      const tools = service.listTools();

      tools.forEach((tool) => {
        if (tool.inputSchema.required) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);

          // All required fields should exist in properties
          tool.inputSchema.required.forEach((field) => {
            expect(tool.inputSchema.properties).toHaveProperty(field);
          });
        }
      });
    });
  });

  describe('callTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await service.callTool('unknown_tool', {}, 'auth-token');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('should execute list_projects tool', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        userProjects: [
          {
            id: '1',
            name: 'Project 1',
          },
        ],
      });

      const result = await service.callTool('list_projects', {}, 'auth-token');

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Project 1');
    });

    it('should return all projects from the API', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        userProjects: [
          {
            id: '1',
            name: 'Active Project',
          },
          {
            id: '2',
            name: 'Another Project',
          },
        ],
      });

      const result = await service.callTool('list_projects', {}, 'auth-token');
      const text = result.content[0].text;

      expect(text).toContain('Active Project');
      expect(text).toContain('Another Project');
    });

    it('should handle tool execution errors gracefully', async () => {
      mockGraphqlClient.query.mockRejectedValue(new Error('Network error'));

      const result = await service.callTool('list_projects', {}, 'auth-token');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network error');
    });
  });
});
