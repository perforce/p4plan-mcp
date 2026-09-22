#!/usr/bin/env node
// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ToolsService } from './tools/tools.service';
import { GraphQLClientService } from './graphql-client/graphql-client.service';
import { SkillsTools } from './tools/skills.tools';
import { SERVER_INSTRUCTIONS } from './config/server-instructions';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loggerFactory } from './factories/logger.factory';
import { createMcpServer } from './factories/mcp-server.factory';

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

  const skillsTools = app.get(SkillsTools);

  const mcpServer = createMcpServer({
    toolsService,
    skillsTools,
    authToken,
    instructions: SERVER_INSTRUCTIONS,
    logger,
  });

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
