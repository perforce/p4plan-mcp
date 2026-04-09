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
  ADD_INTERNAL_LINK_MUTATION,
  DELETE_INTERNAL_LINK_MUTATION,
  ADD_EXTERNAL_LINK_MUTATION,
  DELETE_EXTERNAL_LINK_MUTATION,
} from '../graphql';

/**
 * Task Links Tools
 *
 * Handles item link management:
 * - link_items: Create internal or external links between items
 * - unlink_items: Remove internal or external links
 */
@Injectable()
export class TaskLinksTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // link_items
    tools.set('link_items', {
      definition: {
        name: 'link_items',
        description:
          'Create a link between two items (internal) or from an item to a URL (external). For internal links provide toItemId; for external links provide url instead. Use get_tasks to see existing links on an item.',
        inputSchema: {
          type: 'object',
          properties: {
            fromItemId: {
              type: 'string',
              description: 'The ID of the item to link from',
            },
            toItemId: {
              type: 'string',
              description: 'The ID of the item to link to (for internal links)',
            },
            url: {
              type: 'string',
              description:
                'The URL to link to (for external links — e.g. GitHub PR, Jira issue)',
            },
            relation: {
              type: 'string',
              enum: [
                'relatedTo',
                'duplicates',
                'duplicatedBy',
                'blocks',
                'blockedBy',
              ],
              description: 'The relationship type between the items',
            },
            notes: {
              type: 'string',
              description: 'Optional notes about the link',
            },
          },
          required: ['fromItemId', 'relation'],
        },
      },
      handler: (args, authToken) => this.linkItems(args, authToken),
    });

    // unlink_items
    tools.set('unlink_items', {
      definition: {
        name: 'unlink_items',
        description:
          'Remove a link between two items (internal) or from an item to a URL (external). For internal links provide toItemId; for external links provide url instead.',
        inputSchema: {
          type: 'object',
          properties: {
            fromItemId: {
              type: 'string',
              description: 'The ID of the item the link is from',
            },
            toItemId: {
              type: 'string',
              description:
                'The ID of the item the link goes to (for internal links)',
            },
            url: {
              type: 'string',
              description: 'The URL of the external link to remove',
            },
          },
          required: ['fromItemId'],
        },
      },
      handler: (args, authToken) => this.unlinkItems(args, authToken),
    });

    return tools;
  }

  private async linkItems(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['fromItemId', 'relation'], 'link_items');
    const fromItemId = args.fromItemId as string;
    const toItemId = args.toItemId as string | undefined;
    const url = args.url as string | undefined;
    const relation = args.relation as string;
    const notes = args.notes as string | undefined;

    if (!toItemId && !url) {
      throw new Error(
        'link_items: Either toItemId (internal link) or url (external link) is required',
      );
    }

    if (toItemId) {
      // Internal link
      const input: Record<string, unknown> = {
        fromItemID: fromItemId,
        toItemID: toItemId,
        relation,
      };
      if (notes) input.notes = notes;

      const result = await this.graphqlClient.query<{
        addInternalLink: {
          fromItem: { id: string; name: string };
          toItem: { id: string; name: string };
          relation: string;
          notes: string;
        };
      }>(ADD_INTERNAL_LINK_MUTATION, { addLinkInput: input }, authToken);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Internal link created',
              link: result.addInternalLink,
            }),
          },
        ],
      };
    } else {
      // External link
      const input: Record<string, unknown> = {
        fromItemID: fromItemId,
        url,
        relation,
      };
      if (notes) input.notes = notes;

      const result = await this.graphqlClient.query<{
        addExternalLink: {
          fromItem: { id: string; name: string };
          url: string;
          relation: string;
          notes: string;
        };
      }>(ADD_EXTERNAL_LINK_MUTATION, { addLinkInput: input }, authToken);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'External link created',
              link: result.addExternalLink,
            }),
          },
        ],
      };
    }
  }

  private async unlinkItems(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['fromItemId'], 'unlink_items');
    const fromItemId = args.fromItemId as string;
    const toItemId = args.toItemId as string | undefined;
    const url = args.url as string | undefined;

    if (!toItemId && !url) {
      throw new Error(
        'unlink_items: Either toItemId (internal link) or url (external link) is required',
      );
    }

    if (toItemId) {
      // Delete internal link
      await this.graphqlClient.query<{
        deleteInternalLink: boolean;
      }>(
        DELETE_INTERNAL_LINK_MUTATION,
        {
          deleteLinkInput: { fromItemID: fromItemId, toItemID: toItemId },
        },
        authToken,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Internal link removed',
              fromItemId,
              toItemId,
            }),
          },
        ],
      };
    } else {
      // Delete external link
      await this.graphqlClient.query<{
        deleteExternalLink: boolean;
      }>(
        DELETE_EXTERNAL_LINK_MUTATION,
        {
          deleteLinkInput: { fromItemID: fromItemId, url },
        },
        authToken,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'External link removed',
              fromItemId,
              url,
            }),
          },
        ],
      };
    }
  }
}
