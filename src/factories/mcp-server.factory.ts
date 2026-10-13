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

function normalizeEnumKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function matchEnumValue(
  value: string,
  enumValues: string[],
  aliases: Record<string, string> = {},
): string | undefined {
  if (enumValues.includes(value)) return value;

  const key = normalizeEnumKey(value.trim());
  const matches = enumValues.filter(
    (enumValue) => normalizeEnumKey(enumValue) === key,
  );
  if (matches.length === 1) return matches[0];

  return Object.entries(aliases).find(
    ([alias]) => normalizeEnumKey(alias) === key,
  )?.[1];
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{');
}

function parseJsonString(value: unknown, opening: '[' | '{'): unknown {
  if (typeof value !== 'string' || !value.trim().startsWith(opening)) {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function coerceString(value: unknown): unknown {
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : value;
}

function coerceNumber(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : value;
}

const BOOLEAN_STRINGS: Record<string, boolean> = {
  true: true,
  false: false,
  yes: true,
  no: false,
  '1': true,
  '0': false,
};

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    return Object.hasOwn(BOOLEAN_STRINGS, key) ? BOOLEAN_STRINGS[key] : value;
  }
  if (value === 1 || value === 0) return value === 1;
  return value;
}

function coerceEnum(
  value: unknown,
  enumValues: string[],
  aliases?: Record<string, string>,
): unknown {
  const text = coerceString(value);
  if (typeof text !== 'string') return text;
  return matchEnumValue(text, enumValues, aliases) ?? text;
}

function coerceArray(value: unknown, splitCommaLists: boolean): unknown {
  const parsed = parseJsonString(parseJsonString(value, '['), '{');
  if (Array.isArray(parsed) || parsed === undefined || parsed === null) {
    return parsed;
  }
  if (typeof parsed === 'string') {
    if (!splitCommaLists || looksLikeJson(parsed) || !parsed.trim()) {
      return parsed;
    }
    return parsed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [parsed];
}

function isPlainStringList(items: Record<string, unknown>): boolean {
  return items.type === 'string' && !items.enum;
}

/** Convert a JSON Schema property to a Zod schema (the SDK needs Zod to validate parameters). */
export function jsonSchemaPropertyToZod(
  property: Record<string, unknown>,
): z.ZodTypeAny {
  const schema = buildZodSchema(property);
  const description = property.description as string | undefined;
  return description ? schema.describe(description) : schema;
}

function buildZodSchema(property: Record<string, unknown>): z.ZodTypeAny {
  const type = property.type as string;
  const enumValues = property.enum as string[] | undefined;
  const anyOf = property.anyOf as Array<Record<string, unknown>> | undefined;

  if (enumValues && type === 'string') {
    const aliases = property.enumAliases as Record<string, string> | undefined;
    return z.preprocess(
      (value) => coerceEnum(value, enumValues, aliases),
      z.enum(enumValues as [string, ...string[]]),
    );
  }

  if (anyOf && anyOf.length > 0) {
    const options = anyOf.map((option) => jsonSchemaPropertyToZod(option));
    return options.length === 1
      ? options[0]
      : z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  switch (type) {
    case 'string':
      return z.preprocess(coerceString, z.string());
    case 'number':
      return z.preprocess(coerceNumber, z.number());
    case 'boolean':
      return z.preprocess(coerceBoolean, z.boolean());
    case 'array': {
      const items = property.items as Record<string, unknown> | undefined;
      return z.preprocess(
        (value) => coerceArray(value, items ? isPlainStringList(items) : false),
        items ? z.array(jsonSchemaPropertyToZod(items)) : z.array(z.unknown()),
      );
    }
    case 'object': {
      const properties = property.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      const toObject = (value: unknown) => parseJsonString(value, '{');
      if (properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const required = (property.required as string[]) || [];
        for (const [key, value] of Object.entries(properties)) {
          const fieldSchema = jsonSchemaPropertyToZod(value);
          shape[key] = required.includes(key)
            ? fieldSchema
            : fieldSchema.optional();
        }
        return z.preprocess(toObject, z.object(shape));
      }
      return z.preprocess(toObject, z.record(z.string(), z.unknown()));
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

/**
 * Register every ToolsService tool on the server, routing calls through
 * callTool with the auth token. In read-only mode only the read tools are
 * registered.
 */
export function registerTools(
  mcpServer: McpServer,
  toolsService: ToolsService,
  authToken: string,
  readOnly = false,
): number {
  const tools = toolsService.listTools({ readOnly });

  for (const tool of tools) {
    const zodShape = toolInputSchemaToZod(tool);

    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodShape,
        annotations: tool.annotations,
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
  /** Register only the tools that read (--readonly / P4PLAN_READONLY). */
  readOnly?: boolean;
}): McpServer {
  const {
    toolsService,
    skillsTools,
    authToken,
    instructions,
    logger,
    readOnly = false,
  } = options;

  const mcpServer = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    instructions ? { instructions } : undefined,
  );

  const toolCount = registerTools(mcpServer, toolsService, authToken, readOnly);
  logger?.log(
    readOnly
      ? `Read-only mode: registering ${toolCount} read tools`
      : `Registering ${toolCount} tools`,
    'P4PlanMCP',
  );

  const skillCount = registerSkillResources(mcpServer, skillsTools);
  logger?.log(`Registered ${skillCount} skill resources`, 'P4PlanMCP');

  return mcpServer;
}
