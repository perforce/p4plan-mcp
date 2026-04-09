// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { McpToolResult } from './tools.service';
import { ToolRegistration, validateRequired } from './task-helpers';
import { LIST_PROJECTS_QUERY, GET_PROJECT_QUERY } from '../graphql';

@Injectable()
export class ProjectsTools {
  constructor(private readonly graphqlClient: GraphQLClientService) {}

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    tools.set('list_projects', {
      definition: {
        name: 'list_projects',
        description:
          'List all active projects the current user is a member of. Returns project IDs and names backlogID (needed for backlog operations) and qaID (needed for bug operations). The project ID itself is used for planning/schedule operations.` Call this first to discover projectId values needed by other tools.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: (args, authToken) => this.listProjects(args, authToken),
    });

    // get_project
    tools.set('get_project', {
      definition: {
        name: 'get_project',
        description: `Get a project's configuration and section IDs. Returns backlogID (needed for backlog operations) and qaID (needed for bug operations). The project ID itself is used for planning/schedule operations.`,
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
      handler: (args, authToken) => this.getProject(args, authToken),
    });

    return tools;
  }

  private async listProjects(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const result = await this.graphqlClient.query<{
      userProjects: Array<{
        id: string;
        name: string;
        backlog: {
          id: string;
        };
        qa: {
          id: string;
        };
      }>;
    }>(LIST_PROJECTS_QUERY, {}, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.userProjects),
        },
      ],
    };
  }

  private async getProject(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'get_project');
    const projectId = args.projectId as string;

    const result = await this.graphqlClient.query<{
      project: {
        id: string;
        name: string;
        backlog: {
          id: string;
        };
        qa: {
          id: string;
        };
      };
    }>(GET_PROJECT_QUERY, { id: projectId }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.project),
        },
      ],
    };
  }
}
