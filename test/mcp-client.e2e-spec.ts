// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * MCP Client SDK Integration Tests (stdio transport)
 *
 * Uses the official @modelcontextprotocol/sdk Client + InMemoryTransport
 * to exercise the MCP server exactly as a real client (VS Code, Claude) would.
 *
 * InMemoryTransport creates a linked pair of transports — one for the client,
 * one for the server — enabling full protocol validation without spawning
 * a child process or starting an HTTP server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';

interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * The SDK's `client.callTool()` returns a union with `[x: string]: unknown`
 * index signatures. We define a concrete result type for type-safe assertions.
 */
interface CallToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** Narrow the SDK's opaque callTool() return value to our typed CallToolResult. */
function asCallToolResult(
  result: Awaited<ReturnType<Client['callTool']>>,
): CallToolResult {
  if ('content' in result) {
    return result as unknown as CallToolResult;
  }
  throw new Error(
    'Unexpected CompatibilityCallToolResult (toolResult shape) — expected content[]',
  );
}

jest.setTimeout(15_000);

describe('MCP Client SDK (e2e)', () => {
  let mcpServer: McpServer;
  let client: Client;
  let mockCallTool: jest.Mock;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Register mock tools on the McpServer and connect via InMemoryTransport.
   */
  async function setupServerAndClient(
    tools: Array<{
      name: string;
      description: string;
      schema: Record<string, z.ZodTypeAny>;
    }>,
  ): Promise<void> {
    mcpServer = new McpServer({
      name: 'p4-plan-mcp',
      version: '1.0.0',
    });

    for (const tool of tools) {
      mcpServer.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.schema,
        },
        async (args) => {
          const result = (await mockCallTool(tool.name, args)) as McpToolResult;
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

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-sdk-client', version: '1.0.0' });

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
  }

  // ---------------------------------------------------------------------------
  // Setup / Teardown
  // ---------------------------------------------------------------------------

  const defaultTools: Array<{
    name: string;
    description: string;
    schema: Record<string, z.ZodTypeAny>;
  }> = [
    {
      name: 'get_my_tasks',
      description: 'Get tasks assigned to current user',
      schema: {
        limit: z.number().optional(),
      },
    },
    {
      name: 'list_projects',
      description: 'List all projects',
      schema: {},
    },
  ];

  beforeEach(async () => {
    mockCallTool = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'tool result' }],
    } satisfies McpToolResult);

    await setupServerAndClient(defaultTools);
  });

  afterEach(async () => {
    await client?.close().catch(() => {});
    await mcpServer?.close().catch(() => {});
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Protocol Initialization
  // ---------------------------------------------------------------------------

  describe('Protocol Initialization', () => {
    it('should complete the initialize handshake', () => {
      const serverVersion = client.getServerVersion();
      expect(serverVersion).toBeDefined();
      expect(serverVersion?.name).toBe('p4-plan-mcp');
      expect(serverVersion?.version).toBe('1.0.0');
    });

    it('should report server capabilities after connecting', () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities).toBeDefined();
      expect(capabilities?.tools).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Listing
  // ---------------------------------------------------------------------------

  describe('tools/list', () => {
    it('should list all available tools', async () => {
      const { tools } = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['get_my_tasks', 'list_projects']),
      );
    });

    it('should return tool definitions with expected shape', async () => {
      const { tools } = await client.listTools();
      const getMyTasks = tools.find((tool) => tool.name === 'get_my_tasks');

      expect(getMyTasks).toBeDefined();
      expect(getMyTasks?.description).toBe(
        'Get tasks assigned to current user',
      );
      expect(getMyTasks?.inputSchema.type).toBe('object');
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Calling
  // ---------------------------------------------------------------------------

  describe('tools/call', () => {
    it('should call a tool and return the result', async () => {
      const result = asCallToolResult(
        await client.callTool({
          name: 'get_my_tasks',
          arguments: { limit: 10 },
        }),
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'tool result',
      });
    });

    it('should forward arguments to the tool handler', async () => {
      await client.callTool({
        name: 'get_my_tasks',
        arguments: { limit: 5 },
      });

      expect(mockCallTool).toHaveBeenCalledWith('get_my_tasks', { limit: 5 });
    });

    it('should pass empty arguments when none provided', async () => {
      await client.callTool({
        name: 'list_projects',
        arguments: {},
      });

      expect(mockCallTool).toHaveBeenCalledWith(
        'list_projects',
        expect.any(Object),
      );
    });

    it('should surface tool execution errors via isError flag', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Error: Database connection failed' }],
        isError: true,
      } satisfies McpToolResult);

      const result = asCallToolResult(
        await client.callTool({
          name: 'get_my_tasks',
          arguments: {},
        }),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]).toEqual(
        expect.objectContaining({
          text: expect.stringContaining('Database connection failed') as string,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Sequential Operations (realistic multi-step workflows)
  // ---------------------------------------------------------------------------

  describe('Sequential Operations', () => {
    it('should handle multiple tool calls in sequence', async () => {
      mockCallTool
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'tasks result' }],
        } satisfies McpToolResult)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'projects result' }],
        } satisfies McpToolResult);

      const result1 = asCallToolResult(
        await client.callTool({
          name: 'get_my_tasks',
          arguments: {},
        }),
      );
      const result2 = asCallToolResult(
        await client.callTool({
          name: 'list_projects',
          arguments: {},
        }),
      );

      expect(result1.content[0]).toEqual({
        type: 'text',
        text: 'tasks result',
      });
      expect(result2.content[0]).toEqual({
        type: 'text',
        text: 'projects result',
      });
      expect(mockCallTool).toHaveBeenCalledTimes(2);
    });

    it('should discover tools then call one of them', async () => {
      // Step 1: discover available tools
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // Step 2: call the first discovered tool
      const toolName = tools[0].name;
      const result = asCallToolResult(
        await client.callTool({
          name: toolName,
          arguments: {},
        }),
      );

      expect(result.content).toBeDefined();
      expect(mockCallTool).toHaveBeenCalledWith(toolName, {});
    });

    it('should interleave list and call operations', async () => {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      await client.callTool({ name: 'get_my_tasks', arguments: {} });

      const { tools: tools2 } = await client.listTools();
      expect(tools2).toHaveLength(2);

      await client.callTool({ name: 'list_projects', arguments: {} });

      expect(mockCallTool).toHaveBeenCalledTimes(2);
    });
  });
});
