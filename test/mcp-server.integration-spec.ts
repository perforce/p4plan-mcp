// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * MCP Server Integration Tests (real tools, mocked network)
 *
 * Unlike `mcp-client.e2e-spec.ts` — which registers hand-written mock tools to
 * exercise the SDK protocol layer — this suite boots the *real* NestJS
 * application (real ToolsService, real tool providers, real skill resources)
 * and registers them on a real McpServer via the production
 * `createMcpServer()` factory. It then drives them through a real MCP SDK
 * Client over an in-memory transport.
 *
 * The ONLY thing stubbed is the HTTP/GraphQL boundary (GraphQLClientService),
 * so every layer between the MCP client and the network is the genuine
 * production code path — schema conversion, tool registration, call routing,
 * argument validation, and error surfacing — all validated deterministically
 * with no live P4 Plan server and no AI model.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AppModule } from '../src/app.module';
import { ToolsService } from '../src/tools/tools.service';
import { SkillsTools } from '../src/tools/skills.tools';
import { GraphQLClientService } from '../src/graphql-client/graphql-client.service';
import { createMcpServer } from '../src/factories/mcp-server.factory';

jest.setTimeout(20_000);

const AUTH_TOKEN = 'test-token';

interface CallToolResult {
  content: Array<{ type: string; text?: string; data?: string }>;
  isError?: boolean;
}

/** Narrow the SDK's opaque callTool() return value to a typed result. */
function asResult(
  result: Awaited<ReturnType<Client['callTool']>>,
): CallToolResult {
  if ('content' in result) {
    return result as unknown as CallToolResult;
  }
  throw new Error('Unexpected tool result shape — expected content[]');
}

/** Parse the JSON text payload of a tool result. */
function parseText<T>(result: CallToolResult): T {
  return JSON.parse(result.content[0].text ?? 'null') as T;
}

describe('MCP Server integration (real tools, mocked network)', () => {
  let moduleRef: TestingModule;
  let mcpServer: McpServer;
  let client: Client;
  let toolsService: ToolsService;

  // Stub GraphQLClientService — every call the tool handlers make goes here
  // instead of to the network. Individual tests set the resolved value.
  const mockQuery = jest.fn();
  const mockGraphqlClient = {
    query: mockQuery,
    login: jest.fn(),
    getCurrentUser: jest.fn(),
    downloadAttachment: jest.fn(),
    healthcheck: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
  };

  // Silence the real winston logger so error-path tests don't spew stack
  // traces to stderr or write timestamped files under .logs/ during tests.
  const silentLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GraphQLClientService)
      .useValue(mockGraphqlClient)
      .overrideProvider('LOGGER')
      .useValue(silentLogger)
      .compile();

    toolsService = moduleRef.get(ToolsService);
    const skillsTools = moduleRef.get(SkillsTools);

    // Build the real server exactly as production does.
    mcpServer = createMcpServer({
      toolsService,
      skillsTools,
      authToken: AUTH_TOKEN,
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'integration-test-client', version: '1.0.0' });

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close().catch(() => {});
    await mcpServer?.close().catch(() => {});
    await moduleRef?.close().catch(() => {});
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Protocol / registration
  // ---------------------------------------------------------------------------

  describe('protocol & registration', () => {
    it('completes the initialize handshake with the real server identity', () => {
      const version = client.getServerVersion();
      expect(version?.name).toBe('p4-plan-mcp');
      expect(version?.version).toBe('1.0.0');
    });

    it('reports tool capabilities after connecting', () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities).toBeDefined();
      expect(capabilities?.tools).toBeDefined();
    });

    it('exposes every real ToolsService tool over the protocol (no drift)', async () => {
      const { tools } = await client.listTools();
      const publishedNames = tools.map((t) => t.name).sort();
      const registeredNames = toolsService
        .listTools()
        .map((t) => t.name)
        .sort();

      expect(publishedNames).toEqual(registeredNames);
      // Sanity: the real server exposes a substantial tool set.
      expect(publishedNames.length).toBeGreaterThanOrEqual(20);
    });

    it('includes representative tools from every provider', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toEqual(
        expect.arrayContaining([
          'list_projects', // projects
          'get_project',
          'get_current_user', // users
          'get_my_tasks', // task items
          'create_item', // task crud
          'search_tasks',
        ]),
      );
    });

    it('publishes a valid object input schema for every tool', async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('marks required arguments as required in the published schema', async () => {
      const { tools } = await client.listTools();
      const getProject = tools.find((t) => t.name === 'get_project');

      expect(getProject).toBeDefined();
      expect(getProject?.inputSchema.required).toEqual(
        expect.arrayContaining(['projectId']),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Tool calls routed through the real handler chain
  // ---------------------------------------------------------------------------

  describe('tools/call routing', () => {
    it('routes list_projects through the real handler to the graphql layer', async () => {
      const projects = [
        { id: 'p-1', name: 'Project Alpha' },
        { id: 'p-2', name: 'Project Beta' },
      ];
      mockQuery.mockResolvedValueOnce({ userProjects: projects });

      const result = asResult(
        await client.callTool({ name: 'list_projects', arguments: {} }),
      );

      expect(result.isError).toBeFalsy();
      expect(parseText(result)).toEqual(projects);

      // The real auth token was threaded all the way through.
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [, variables, token] = mockQuery.mock.calls[0] as [
        string,
        Record<string, unknown>,
        string,
      ];
      expect(variables).toEqual({});
      expect(token).toBe(AUTH_TOKEN);
    });

    it('forwards arguments through to the graphql variables', async () => {
      mockQuery.mockResolvedValueOnce({
        project: { id: 'p-1', name: 'Project Alpha' },
      });

      const result = asResult(
        await client.callTool({
          name: 'get_project',
          arguments: { projectId: 'p-1' },
        }),
      );

      expect(result.isError).toBeFalsy();
      expect(parseText<{ id: string }>(result).id).toBe('p-1');

      const [, variables, token] = mockQuery.mock.calls[0] as [
        string,
        Record<string, unknown>,
        string,
      ];
      expect(variables).toEqual({ id: 'p-1' });
      expect(token).toBe(AUTH_TOKEN);
    });

    it('surfaces missing-required-argument validation as an error result', async () => {
      const result = asResult(
        await client.callTool({ name: 'get_project', arguments: {} }),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('projectId');
      // Validation short-circuits before any network call.
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('surfaces a thrown graphql error as an error result, not a crash', async () => {
      mockQuery.mockRejectedValueOnce(
        new Error('GraphQL Error: something broke'),
      );

      const result = asResult(
        await client.callTool({
          name: 'get_project',
          arguments: { projectId: 'p-1' },
        }),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('something broke');
    });

    it('supports interleaved list and call operations over one session', async () => {
      mockQuery.mockResolvedValue({ userProjects: [] });

      const { tools: before } = await client.listTools();
      expect(before.length).toBeGreaterThan(0);

      const result = asResult(
        await client.callTool({ name: 'list_projects', arguments: {} }),
      );
      expect(result.isError).toBeFalsy();

      // The tool set is stable across calls on the same connection.
      const { tools: after } = await client.listTools();
      expect(after.map((t) => t.name)).toEqual(before.map((t) => t.name));
    });
  });

  // ---------------------------------------------------------------------------
  // Skill resources
  // ---------------------------------------------------------------------------

  describe('skill resources', () => {
    it('registers skill documents as readable MCP resources', async () => {
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);

      const first = resources[0];
      expect(first.uri).toMatch(/^skill:\/\/p4-plan\//);

      const read = await client.readResource({ uri: first.uri });
      expect(read.contents.length).toBeGreaterThan(0);
      expect(typeof read.contents[0].text).toBe('string');
    });
  });
});
