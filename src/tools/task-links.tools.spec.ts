// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskLinksTools } from './task-links.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('TaskLinksTools', () => {
  let tools: TaskLinksTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new TaskLinksTools(
      mockGraphqlClient as unknown as GraphQLClientService,
    );
  });

  function callTool(
    name: string,
    args: Record<string, unknown>,
    authToken = 'test-token',
  ): Promise<McpToolResult> | McpToolResult {
    const toolMap = tools.getTools();
    const tool = toolMap.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args, authToken);
  }

  describe('tool registration', () => {
    it('should register all expected tools', () => {
      const names = Array.from(tools.getTools().keys());
      expect(names).toContain('link_items');
      expect(names).toContain('unlink_items');
      expect(names).toHaveLength(2);
    });
  });

  describe('link_items', () => {
    it('should create an internal link between two items', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        addInternalLink: {
          fromItem: { id: 't-1', name: 'Task 1' },
          toItem: { id: 't-2', name: 'Task 2' },
          relation: 'blocks',
          notes: '',
        },
      });

      const result = await callTool('link_items', {
        fromItemId: 't-1',
        toItemId: 't-2',
        relation: 'blocks',
      });
      const data = parseToolResult<{
        message: string;
        link: { relation: string };
      }>(result);

      expect(data.message).toBe('Internal link created');
      expect(data.link.relation).toBe('blocks');
      const [, linkVars, linkToken] = getQueryCall(mockGraphqlClient.query, 0);
      expect(linkVars).toMatchObject({
        addLinkInput: {
          fromItemID: 't-1',
          toItemID: 't-2',
          relation: 'blocks',
        },
      });
      expect(linkToken).toBe('test-token');
    });

    it('should create an internal link with notes', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        addInternalLink: {
          fromItem: { id: 't-1', name: 'Task 1' },
          toItem: { id: 't-3', name: 'Task 3' },
          relation: 'relatedTo',
          notes: 'See also',
        },
      });

      await callTool('link_items', {
        fromItemId: 't-1',
        toItemId: 't-3',
        relation: 'relatedTo',
        notes: 'See also',
      });

      const [, notesVars, notesToken] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(notesVars).toMatchObject({
        addLinkInput: {
          fromItemID: 't-1',
          toItemID: 't-3',
          relation: 'relatedTo',
          notes: 'See also',
        },
      });
      expect(notesToken).toBe('test-token');
    });

    it('should create an external link to a URL', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        addExternalLink: {
          fromItem: { id: 't-1', name: 'Task 1' },
          url: 'https://github.com/org/repo/pull/42',
          relation: 'relatedTo',
          notes: '',
        },
      });

      const result = await callTool('link_items', {
        fromItemId: 't-1',
        url: 'https://github.com/org/repo/pull/42',
        relation: 'relatedTo',
      });
      const data = parseToolResult<{
        message: string;
        link: { url: string };
      }>(result);

      expect(data.message).toBe('External link created');
      expect(data.link.url).toBe('https://github.com/org/repo/pull/42');
    });

    it('should throw when neither toItemId nor url is provided', async () => {
      await expect(
        callTool('link_items', { fromItemId: 't-1', relation: 'blocks' }),
      ).rejects.toThrow(
        'Either toItemId (internal link) or url (external link) is required',
      );
    });

    it('should throw when fromItemId is missing', async () => {
      await expect(
        callTool('link_items', { toItemId: 't-2', relation: 'blocks' }),
      ).rejects.toThrow("link_items: 'fromItemId' is required");
    });

    it('should throw when relation is missing', async () => {
      await expect(
        callTool('link_items', { fromItemId: 't-1', toItemId: 't-2' }),
      ).rejects.toThrow("link_items: 'relation' is required");
    });
  });

  describe('unlink_items', () => {
    it('should delete an internal link', async () => {
      mockGraphqlClient.query.mockResolvedValue({ deleteInternalLink: true });

      const result = await callTool('unlink_items', {
        fromItemId: 't-1',
        toItemId: 't-2',
      });
      const data = parseToolResult<{ success: boolean; message: string }>(
        result,
      );

      expect(data.success).toBe(true);
      expect(data.message).toBe('Internal link removed');
      const [, unlinkVars, unlinkToken] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(unlinkVars).toMatchObject({
        deleteLinkInput: { fromItemID: 't-1', toItemID: 't-2' },
      });
      expect(unlinkToken).toBe('test-token');
    });

    it('should delete an external link', async () => {
      mockGraphqlClient.query.mockResolvedValue({ deleteExternalLink: true });

      const result = await callTool('unlink_items', {
        fromItemId: 't-1',
        url: 'https://jira.example.com/PROJ-123',
      });
      const data = parseToolResult<{
        success: boolean;
        message: string;
        url: string;
      }>(result);

      expect(data.success).toBe(true);
      expect(data.message).toBe('External link removed');
      expect(data.url).toBe('https://jira.example.com/PROJ-123');
    });

    it('should throw when neither toItemId nor url is provided', async () => {
      await expect(
        callTool('unlink_items', { fromItemId: 't-1' }),
      ).rejects.toThrow(
        'Either toItemId (internal link) or url (external link) is required',
      );
    });

    it('should throw when fromItemId is missing', async () => {
      await expect(
        callTool('unlink_items', { toItemId: 't-2' }),
      ).rejects.toThrow("unlink_items: 'fromItemId' is required");
    });
  });
});
