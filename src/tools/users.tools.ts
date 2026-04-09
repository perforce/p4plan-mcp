// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import { ToolRegistration, validateRequired } from './task-helpers';
import { GET_CURRENT_USER_QUERY, GET_PROJECT_USERS_QUERY } from '../graphql';

@Injectable()
export class UsersTools {
  constructor(private readonly graphqlClient: GraphQLClientService) {}

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // get_current_user
    tools.set('get_current_user', {
      definition: {
        name: 'get_current_user',
        description:
          'Get information about the currently authenticated user, including their name and email.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: (args, authToken) => this.getCurrentUser(args, authToken),
    });

    // list_project_users
    tools.set('list_project_users', {
      definition: {
        name: 'list_project_users',
        description:
          'List all members of a project. Returns user IDs and names. Use the IDs with update_item (assignedTo) to assign work.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
          },
          required: ['projectId'],
        },
      },
      handler: (args, authToken) => this.listProjectUsers(args, authToken),
    });

    return tools;
  }

  private async getCurrentUser(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const result = await this.graphqlClient.query<{
      authenticatedUser: {
        id: string;
        name: string;
        email?: string;
      };
    }>(GET_CURRENT_USER_QUERY, {}, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.authenticatedUser),
        },
      ],
    };
  }

  private async listProjectUsers(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'list_project_users');
    const projectId = args.projectId as string;

    const result = await this.graphqlClient.query<{
      project: {
        id: string;
        name: string;
        users: Array<{
          user: {
            id: string;
            name: string;
            email?: string;
          };
          accessRights: {
            isMainManager: boolean;
            limitedVisibility: boolean;
          };
        }>;
      };
    }>(GET_PROJECT_USERS_QUERY, { id: projectId }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.project.users),
        },
      ],
    };
  }
}
