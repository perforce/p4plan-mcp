#!/usr/bin/env node
// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpTool, ToolsService } from './tools/tools.service';
import { GraphQLClientService } from './graphql-client/graphql-client.service';
import { SkillsTools } from './tools/skills.tools';
import { SERVER_INSTRUCTIONS } from './config/server-instructions';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loggerFactory } from './factories/logger.factory';

/**
 * Convert a JSON Schema property definition to a Zod schema.
 * The SDK's server.tool() requires Zod schemas for parameter validation.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
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
function toolInputSchemaToZod(tool: McpTool): Record<string, z.ZodTypeAny> {
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

async function bootstrap() {
  const logger = loggerFactory;

  logger.log(`Using Node.js version: ${process.version}`, 'P4PlanMCP');
  logger.log('Starting in stdio transport mode', 'P4PlanMCP');

  if (
    process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS === 'true' ||
    process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS === '1'
  ) {
    logger.warn?.(
      'TLS certificate validation is disabled (P4PLAN_ALLOW_SELF_SIGNED_CERTS is set)',
      'P4PlanMCP',
    );
  }

  // Get the auth token from environment
  const authToken = process.env.P4PLAN_API_AUTH_TOKEN;
  if (!authToken) {
    logger.error(
      'P4PLAN_API_AUTH_TOKEN environment variable is required. Set it in your client config (e.g., .vscode/mcp.json env block).',
      '',
      'P4PlanMCP',
    );
    process.exit(1);
  }

  // Bootstrap NestJS for dependency injection (without starting HTTP listener)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: loggerFactory,
  });

  const toolsService = app.get(ToolsService);
  const graphqlClient = app.get(GraphQLClientService);

  // Validate the token at startup
  try {
    const user = await graphqlClient.getCurrentUser(authToken);
    logger.log(`Authenticated as: ${user.name}`, 'P4PlanMCP');
  } catch (error) {
    logger.error(
      `Authentication failed: ${error instanceof Error ? error.message : 'Invalid token'}`,
      error instanceof Error ? error.stack : '',
      'P4PlanMCP',
    );
    process.exit(1);
  }

  const mcpServer = new McpServer(
    {
      name: 'p4-plan-mcp',
      version: '1.0.0',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const tools = toolsService.listTools();
  logger.log(`Registering ${tools.length} tools`, 'P4PlanMCP');

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

  // Register skill documents as MCP resources (for clients that support resource reading)
  const skillsTools = app.get(SkillsTools);
  for (const [skillName, content] of skillsTools.getSkillContents()) {
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
  logger.log(
    `Registered ${skillsTools.getSkillContents().size} skill resources`,
    'P4PlanMCP',
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  logger.log(
    'MCP server connected via stdio — ready for requests',
    'P4PlanMCP',
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down...', 'P4PlanMCP');
    await mcpServer.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();
