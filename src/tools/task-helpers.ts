// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import { GET_PROJECT_SECTIONS_QUERY, GET_TASK_TYPE_QUERY } from '../graphql';

/**
 * Tool registration interface
 */
export interface ToolRegistration {
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
    annotations: Readonly<ToolAnnotations>;
  };
  handler: (
    args: Record<string, unknown>,
    authToken: string,
  ) => Promise<McpToolResult> | McpToolResult;
}

/**
 * Annotations for tools that only read. Required on every tool: read-only mode
 * (--readonly / P4PLAN_READONLY) keeps exactly the tools with readOnlyHint
 * true, and clients use the hints to decide when to ask before a call.
 */
export const READ_ONLY_ANNOTATIONS: Readonly<ToolAnnotations> = Object.freeze({
  readOnlyHint: true,
  openWorldHint: false,
});

/**
 * Annotations for tools that write. destructive: the call deletes or overwrites
 * existing data, including status or sprint (as opposed to only adding). idempotent: repeating the call
 * with the same arguments has no further effect.
 */
export function writeAnnotations(options: {
  destructive: boolean;
  idempotent: boolean;
}): ToolAnnotations {
  return {
    readOnlyHint: false,
    destructiveHint: options.destructive,
    idempotentHint: options.idempotent,
    openWorldHint: false,
  };
}

export interface NamedId {
  id: string;
  name: string;
}

export function isMeaningful(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  );
}

export function findNamedMatches<T extends NamedId>(
  value: string,
  candidates: T[],
): T[] {
  const trimmed = String(value).trim();
  const idMatch = candidates.find((candidate) => candidate.id === trimmed);
  if (idMatch) return [idMatch];
  return candidates.filter(
    (candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase(),
  );
}

export interface ProjectSections {
  id: string;
  name: string;
  backlog: { id: string };
  qa: { id: string };
}

export function findProjectByName(
  projects: Array<ProjectSections | null>,
  name: string,
): ProjectSections | undefined {
  const key = name.trim().toLowerCase();
  return projects.find(
    (project): project is ProjectSections =>
      project !== null && project.name.toLowerCase() === key,
  );
}

export function describeCandidates(candidates: NamedId[]): string {
  const shown = candidates
    .slice(0, 20)
    .map((candidate) => `${candidate.name} (${candidate.id})`)
    .join(', ');
  const truncated =
    candidates.length > 20 ? ` (first 20 of ${candidates.length})` : '';
  return `Available${truncated}: ${shown || 'none'}`;
}

export function resolveNamedId(
  toolName: string,
  value: string,
  candidates: NamedId[],
  kind: string,
  listTool?: string,
): string {
  const trimmed = String(value).trim();
  const matches = findNamedMatches(trimmed, candidates);
  if (matches.length > 1) {
    throw new Error(
      `${toolName}: ${kind} name "${trimmed}" is ambiguous: ${matches.map((candidate) => `${candidate.name} (${candidate.id})`).join(', ')}. Pass the ID instead`,
    );
  }
  if (matches.length === 1) return matches[0].id;
  throw new Error(
    `${toolName}: unknown ${kind} "${trimmed}"${listTool ? ` — see ${listTool}` : ''}. ${describeCandidates(candidates)}`,
  );
}

/**
 * Validate that all required fields are present and non-empty in tool arguments.
 * Throws a clear error message if any are missing.
 */
export function validateRequired(
  args: Record<string, unknown>,
  fields: string[],
  toolName: string,
): void {
  for (const field of fields) {
    const value = args[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`${toolName}: '${field}' is required`);
    }
  }
}

/**
 * Base class for task tool providers with shared helper methods
 */
export abstract class TaskToolsBase {
  constructor(protected readonly graphqlClient: GraphQLClientService) {}

  /**
   * Helper to get project section IDs (main, backlog, QA)
   */
  protected async getProjectSections(
    projectId: string,
    authToken: string,
  ): Promise<{ id: string; name: string; backlogId: string; qaId: string }> {
    const result = await this.graphqlClient.query<{
      project: {
        id: string;
        name: string;
        backlog: { id: string };
        qa: { id: string };
      };
    }>(GET_PROJECT_SECTIONS_QUERY, { id: projectId }, authToken);

    return {
      id: result.project.id,
      name: result.project.name,
      backlogId: result.project.backlog.id,
      qaId: result.project.qa.id,
    };
  }

  /**
   * Helper to get the type of a task (BacklogTask, Bug, ScheduledTask, etc.)
   */
  protected async getTaskType(
    taskId: string,
    authToken: string,
  ): Promise<string> {
    const result = await this.graphqlClient.query<{
      item: { __typename: string };
    }>(GET_TASK_TYPE_QUERY, { id: taskId }, authToken);

    return result.item.__typename;
  }

  /**
   * Helper to build a mutation for updating a task based on its type.
   * Returns the mutation string and the result key to extract from the response.
   */
  protected buildUpdateMutation(
    taskType: string,
    returnFields: string,
  ): { mutation: string; resultKey: string } {
    const typeConfig: Record<
      string,
      { inputType: string; mutationName: string; resultKey: string }
    > = {
      Bug: {
        inputType: 'UpdateBugInput',
        mutationName: 'updateBug',
        resultKey: 'updateBug',
      },
      ScheduledTask: {
        inputType: 'UpdateScheduledTaskInput',
        mutationName: 'updateScheduledTask',
        resultKey: 'updateScheduledTask',
      },
      BacklogTask: {
        inputType: 'UpdateBacklogTaskInput',
        mutationName: 'updateBacklogTask',
        resultKey: 'updateBacklogTask',
      },
    };

    const config = typeConfig[taskType] || typeConfig.BacklogTask;

    const mutation = `
      mutation ${config.mutationName.charAt(0).toUpperCase() + config.mutationName.slice(1)}($input: ${config.inputType}!) {
        ${config.mutationName}(${config.mutationName}Input: $input) {
          ${returnFields}
        }
      }
    `;

    return { mutation, resultKey: config.resultKey };
  }
}
