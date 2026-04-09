// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

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
  };
  handler: (
    args: Record<string, unknown>,
    authToken: string,
  ) => Promise<McpToolResult> | McpToolResult;
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
