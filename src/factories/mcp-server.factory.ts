// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * MCP server factory. Builds an McpServer from the app's ToolsService and
 * SkillsTools, shared by the production bootstrap (main.ts) and the
 * integration tests so both wire the server the same way.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LoggerService } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpTool, ToolsService } from '../tools/tools.service';
import type { SkillsTools } from '../tools/skills.tools';

const SERVER_NAME = 'p4-plan-mcp';

// Sourced from package.json so the version reported in the MCP initialize
// handshake can never drift from the published release. The relative path
// resolves to the package root from both src/factories (ts-jest) and
// dist/factories (built output, Docker image, npm install).
const { version: SERVER_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { version: string };

/** Convert a JSON Schema property to a Zod schema (the SDK needs Zod to validate parameters). */
export function jsonSchemaPropertyToZod(
  property: Record<string, unknown>,
): z.ZodTypeAny {
  const type = property.type as string;
  const enumValues = property.enum as string[] | undefined;

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
      const items = property.items as Record<string, unknown> | undefined;
      if (items) {
        return z.array(jsonSchemaPropertyToZod(items));
      }
      return z.array(z.unknown());
    }
    case 'object': {
      const properties = property.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const required = (property.required as string[]) || [];
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

export function toolInputSchemaToZod(
  tool: McpTool,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required || [];

  for (const [key, value] of Object.entries(properties)) {
    const property = value as Record<string, unknown>;
    const fieldSchema = jsonSchemaPropertyToZod(property);
    shape[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
  }

  return shape;
}

/** Register every ToolsService tool on the server, routing calls through callTool with the auth token. */
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

/** Register each skill document as an MCP resource, for clients that read resources. */
export function registerSkillResources(
  mcpServer: McpServer,
  skillsTools: SkillsTools,
): number {
  const skills = skillsTools.getSkillContents();

  for (const [skillName, content] of skills) {
    const uri = `skill://p4-plan/${skillName}`;

    // Pull the description out of the SKILL.md YAML frontmatter.
    const descriptionMatch = content.match(
      /^---\s*\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/,
    );
    const description = descriptionMatch
      ? descriptionMatch[1].trim()
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
 * Build a fully-wired McpServer, ready to connect to a transport. Transport-
 * agnostic: the caller attaches stdio (production) or an in-memory transport (tests).
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
