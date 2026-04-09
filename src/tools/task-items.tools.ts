// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import { TaskToolsBase, ToolRegistration } from './task-helpers';
import { GET_TODO_LIST_QUERY } from '../graphql';

/**
 * Task Items Tools
 *
 * Handles task listing operations:
 * - get_my_tasks: Get tasks assigned to current user
 */
@Injectable()
export class TaskItemsTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // get_my_tasks
    tools.set('get_my_tasks', {
      definition: {
        name: 'get_my_tasks',
        description:
          'Get all tasks assigned to the current user across all projects (their To Do List). Returns tasks, bugs, and scheduled items the user is responsible for.',
        inputSchema: {
          type: 'object',
          properties: {
            showCompleted: {
              type: 'boolean',
              description: 'Include completed tasks (default: false)',
            },
            showOnlyNextFourWeeks: {
              type: 'boolean',
              description:
                'Only show tasks that should be started in the next 4 weeks (default: false)',
            },
            showHidden: {
              type: 'boolean',
              description: 'Include hidden tasks (default: false)',
            },
            showPipelineTasksThatCannotStart: {
              type: 'boolean',
              description:
                'Include pipeline tasks that cannot start yet (default: false)',
            },
          },
        },
      },
      handler: (args, authToken) => this.getMyTasks(args, authToken),
    });

    return tools;
  }

  private async getMyTasks(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const showOptions = {
      showCompleted: (args.showCompleted as boolean) ?? false,
      showOnlyNextFourWeeksOfTasks:
        (args.showOnlyNextFourWeeks as boolean) ?? false,
      showHidden: (args.showHidden as boolean) ?? false,
      showPipelineTasksThatCannotStart:
        (args.showPipelineTasksThatCannotStart as boolean) ?? false,
    };

    const result = await this.graphqlClient.query<{
      todoList: Array<{
        id: string;
        name: string;
        projectID: string;
        status?: string;
        backlogPriority?: string;
        sprintPriority?: string;
        severity?: string;
        confidence?: string;
        risk?: string;
        duration?: number;
        estimatedDays?: number;
        percentCompleted?: number;
        workRemaining?: number;
        isUserStory?: boolean;
        userStory?: string;
        workflow?: { id: string; name: string };
        workflowStatus?: { id: string; name: string };
      }>;
    }>(GET_TODO_LIST_QUERY, { showOptions }, authToken);

    const tasks = result.todoList.map((item) => ({
      id: item.id,
      name: item.name,
      projectID: item.projectID,
      status: item.status,
      priority: item.backlogPriority,
      sprintPriority: item.sprintPriority,
      severity: item.severity,
      confidence: item.confidence,
      risk: item.risk,
      duration: item.duration,
      estimatedDays: item.estimatedDays,
      percentCompleted: item.percentCompleted,
      workRemaining: item.workRemaining,
      isUserStory: item.isUserStory,
      userStory: item.userStory,
      workflow: item.workflow,
      workflowStatus: item.workflowStatus,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: tasks.length,
            tasks,
          }),
        },
      ],
    };
  }
}
