// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import {
  TaskToolsBase,
  ToolRegistration,
  validateRequired,
} from './task-helpers';
import {
  COMMIT_TO_SPRINT_MUTATION,
  UNCOMMIT_FROM_SPRINT_MUTATION,
} from '../graphql';

/**
 * Task Actions Tools
 *
 * Handles task actions:
 * - commit_to_sprint: Commit a task to a sprint
 * - uncommit_from_sprint: Remove a task from a sprint
 */
@Injectable()
export class TaskActionsTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // commit_to_sprint
    tools.set('commit_to_sprint', {
      definition: {
        name: 'commit_to_sprint',
        description: 'Commit a backlog task or bug to a sprint for execution.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the backlog task or bug to commit',
            },
            sprintId: {
              type: 'string',
              description: 'The ID of the sprint to commit the task to',
            },
          },
          required: ['taskId', 'sprintId'],
        },
      },
      handler: (args, authToken) => this.commitToSprint(args, authToken),
    });

    // uncommit_from_sprint
    tools.set('uncommit_from_sprint', {
      definition: {
        name: 'uncommit_from_sprint',
        description:
          'Remove a backlog task or bug from its sprint, returning it to the backlog. The task is not deleted — only the sprint association is removed.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the backlog task or bug to uncommit',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.uncommitFromSprint(args, authToken),
    });

    return tools;
  }

  private async commitToSprint(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'sprintId'], 'commit_to_sprint');
    const taskId = args.taskId as string;
    const sprintId = args.sprintId as string;

    const result = await this.graphqlClient.query<{
      commitToSprint: {
        id: string;
        name: string;
      };
    }>(
      COMMIT_TO_SPRINT_MUTATION,
      { taskID: taskId, sprintID: sprintId },
      authToken,
    );

    return {
      content: [
        {
          type: 'text',
          text: `Committed task to sprint: ${JSON.stringify(result.commitToSprint)}`,
        },
      ],
    };
  }

  private async uncommitFromSprint(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId'], 'uncommit_from_sprint');
    const taskId = args.taskId as string;

    const result = await this.graphqlClient.query<{
      uncommitFromSprint: {
        id: string;
        name: string;
      };
    }>(UNCOMMIT_FROM_SPRINT_MUTATION, { taskID: taskId }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: `Uncommitted task from sprint: ${JSON.stringify(result.uncommitFromSprint)}`,
        },
      ],
    };
  }
}
