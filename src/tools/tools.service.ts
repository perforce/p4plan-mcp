// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ProjectsTools } from './projects.tools';
import { TasksTools } from './tasks.tools';
import { UsersTools } from './users.tools';
import { SkillsTools } from './skills.tools';

/**
 * MCP Tool definition following the MCP specification
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Result of a tool execution
 */
export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  authToken: string,
) => Promise<McpToolResult> | McpToolResult;

/**
 * Tools Service
 *
 * Manages all MCP tools and routes tool calls to appropriate handlers.
 */
@Injectable()
export class ToolsService {
  private readonly tools = new Map<string, McpTool>();
  private readonly handlers = new Map<string, ToolHandler>();

  constructor(
    private readonly projectsTools: ProjectsTools,
    private readonly tasksTools: TasksTools,
    private readonly usersTools: UsersTools,
    private readonly skillsTools: SkillsTools,
    @Inject('LOGGER') private readonly logger: LoggerService,
  ) {
    this.registerAllTools();
  }

  /**
   * Register all available tools
   */
  private registerAllTools(): void {
    // Register projects tools
    this.projectsTools.getTools().forEach((tool, name) => {
      this.tools.set(name, tool.definition);
      this.handlers.set(name, tool.handler);
    });

    // Register tasks tools
    this.tasksTools.getTools().forEach((tool, name) => {
      this.tools.set(name, tool.definition);
      this.handlers.set(name, tool.handler);
    });

    // Register users tools
    this.usersTools.getTools().forEach((tool, name) => {
      this.tools.set(name, tool.definition);
      this.handlers.set(name, tool.handler);
    });

    // Register skills tools
    this.skillsTools.getTools().forEach((tool, name) => {
      this.tools.set(name, tool.definition);
      this.handlers.set(name, tool.handler);
    });

    this.logger.log(
      `Registered ${this.tools.size} MCP tools`,
      ToolsService.name,
    );
  }

  /**
   * List all available tools
   */
  listTools(): McpTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Call a tool by name
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const handler = this.handlers.get(name);

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      return await handler(args, authToken);
    } catch (error) {
      this.logger.error(
        `Tool ${name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        ToolsService.name,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Tool execution failed'}`,
          },
        ],
        isError: true,
      };
    }
  }
}
