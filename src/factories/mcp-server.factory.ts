// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * MCP server factory.
 *
 * Builds and wires an {@link McpServer} from the application's
 * {@link ToolsService} and {@link SkillsTools}. This is the single source of
 * truth for how P4 Plan tools and skill resources are exposed over MCP — used
 * both by the production bootstrap in `main.ts` and by the integration tests,
 * so the two can never drift apart.
 */

import type { LoggerService } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpTool, ToolsService } from '../tools/tools.service';
import type { SkillsTools } from '../tools/skills.tools';

const SERVER_NAME = 'p4-plan-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * Convert a JSON Schema property definition to a Zod schema.
 * The SDK's registerTool() requires Zod schemas for parameter validation.
 */
export function jsonSchemaPropertyToZod(
  prop: Record<string, unknown>,
): z.ZodTypeAny {
  const type = prop.type as string;
  const enumValues = prop.enum as string[] | undefined;

  if (enumValues && type === 'string') {
    return z.enum(enumValues as [string, ...string[]]);
  }

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = prop.items as Record<string, unknown> | undefined;
      if (items) {
        return z.array(jsonSchemaPropertyToZod(items));
      }
      return z.array(z.unknown());
    }
    case 'object': {
      const properties = prop.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const required = (prop.required as string[]) || [];
        for (const [key, value] of Object.entries(properties)) {
          const fieldSchema = jsonSchemaPropertyToZod(value);
          shape[key] = required.includes(key)
            ? fieldSchema
            : fieldSchema.optional();
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * Convert an McpTool's inputSchema to a Zod object schema for the SDK.
 */
export function toolInputSchemaToZod(
  tool: McpTool,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required || [];

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    const fieldSchema = jsonSchemaPropertyToZod(prop);
    shape[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
  }

  return shape;
}

/**
 * Register every tool from {@link ToolsService} on the given MCP server.
 * Each tool's JSON Schema is converted to Zod for the SDK, and calls are
 * routed through {@link ToolsService.callTool} with the supplied auth token.
 */
export function registerTools(
  mcpServer: McpServer,
  toolsService: ToolsService,
  authToken: string,
): number {
  const tools = toolsService.listTools();

  for (const tool of tools) {
    const zodShape = toolInputSchemaToZod(tool);

    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodShape,
      },
      async (args) => {
        const result = await toolsService.callTool(
          tool.name,
          args as Record<string, unknown>,
          authToken,
        );
        return {
          content: result.content.map((content) => {
            if (content.type === 'image') {
              return {
                type: 'image' as const,
                data: content.data ?? '',
                mimeType: content.mimeType ?? 'application/octet-stream',
              };
            }
            return {
              type: 'text' as const,
              text: content.text ?? '',
            };
          }),
          isError: result.isError,
        };
      },
    );
  }

  return tools.length;
}

/**
 * Register every skill document from {@link SkillsTools} as an MCP resource
 * (for clients that support resource reading).
 */
export function registerSkillResources(
  mcpServer: McpServer,
  skillsTools: SkillsTools,
): number {
  const skills = skillsTools.getSkillContents();

  for (const [skillName, content] of skills) {
    const uri = `skill://p4-plan/${skillName}`;

    // Extract description from YAML frontmatter
    const descMatch = content.match(
      /^---\s*\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/,
    );
    const description = descMatch
      ? descMatch[1].trim()
      : `P4 Plan ${skillName} skill`;

    mcpServer.registerResource(
      skillName,
      uri,
      { description, mimeType: 'text/markdown' },
      () => ({
        contents: [{ uri, text: content, mimeType: 'text/markdown' }],
      }),
    );
  }

  return skills.size;
}

/**
 * Build a fully-wired {@link McpServer}: instantiate it, register all tools and
 * skill resources, and return it ready to connect to a transport.
 *
 * This is intentionally transport-agnostic — the caller connects it to stdio
 * (production) or an in-memory transport (integration tests).
 */
export function createMcpServer(options: {
  toolsService: ToolsService;
  skillsTools: SkillsTools;
  authToken: string;
  instructions?: string;
  logger?: LoggerService;
}): McpServer {
  const { toolsService, skillsTools, authToken, instructions, logger } =
    options;

  const mcpServer = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    instructions ? { instructions } : undefined,
  );

  const toolCount = registerTools(mcpServer, toolsService, authToken);
  logger?.log(`Registering ${toolCount} tools`, 'P4PlanMCP');

  const skillCount = registerSkillResources(mcpServer, skillsTools);
  logger?.log(`Registered ${skillCount} skill resources`, 'P4PlanMCP');

  return mcpServer;
}
