// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskCommentsTools } from './task-comments.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('TaskCommentsTools', () => {
  let tools: TaskCommentsTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new TaskCommentsTools(
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
      expect(names).toContain('get_comments');
      expect(names).toContain('post_comment');
      expect(names).toContain('get_attachments');
      expect(names).toContain('download_attachment');
      expect(names).toContain('delete_attachment');
      expect(names).toContain('set_cover_image');
      expect(names).toContain('update_comment');
      expect(names).toContain('delete_comment');
      expect(names).toHaveLength(8);
    });
  });

  describe('get_comments', () => {
    it('should return comments for a task', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        comments: [
          {
            id: 'c-1',
            text: 'Great work!',
            postedBy: { id: 'u-1', name: 'Alice' },
            postedAt: '2026-02-20',
          },
          {
            id: 'c-2',
            text: 'Thanks!',
            postedBy: { id: 'u-2', name: 'Bob' },
            postedAt: '2026-02-20',
          },
        ],
      });

      const result = await callTool('get_comments', { taskId: 't-1' });
      const data = parseToolResult<{
        taskId: string;
        count: number;
        comments: { text: string }[];
      }>(result);

      expect(data.taskId).toBe('t-1');
      expect(data.count).toBe(2);
      expect(data.comments).toHaveLength(2);
      expect(data.comments[0].text).toBe('Great work!');
    });

    it('should return empty comments array', async () => {
      mockGraphqlClient.query.mockResolvedValue({ comments: [] });

      const result = await callTool('get_comments', { taskId: 't-1' });
      const data = parseToolResult<{ count: number; comments: unknown[] }>(
        result,
      );

      expect(data.count).toBe(0);
      expect(data.comments).toHaveLength(0);
    });

    it('should throw when taskId is missing', async () => {
      await expect(callTool('get_comments', {})).rejects.toThrow(
        "get_comments: 'taskId' is required",
      );
    });
  });

  describe('post_comment', () => {
    it('should post a comment and return the result', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        postComment: {
          id: 'c-new',
          text: 'Nice progress',
          postedBy: { id: 'u-1', name: 'Alice' },
          postedAt: '2026-02-20T12:00:00Z',
        },
      });

      const result = await callTool('post_comment', {
        taskId: 't-1',
        text: 'Nice progress',
      });

      expect(result.content[0].text).toContain('Nice progress');
      const [, postVars, postToken] = getQueryCall(mockGraphqlClient.query, 0);
      expect(postVars).toEqual({
        input: { itemID: 't-1', text: 'Nice progress' },
      });
      expect(postToken).toBe('test-token');
    });

    it('should throw when taskId is missing', async () => {
      await expect(callTool('post_comment', { text: 'Hello' })).rejects.toThrow(
        "post_comment: 'taskId' is required",
      );
    });

    it('should throw when text is missing', async () => {
      await expect(callTool('post_comment', { taskId: 't-1' })).rejects.toThrow(
        "post_comment: 'text' is required",
      );
    });
  });

  describe('get_attachments', () => {
    it('should return attachments for a task', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        item: {
          id: 't-1',
          name: 'Task',
          attachments: [
            {
              id: 'a-1',
              path: '/uploads/screenshot.png',
              size: 12345,
              version: 1,
              imageWidth: 800,
              imageHeight: 600,
              coverImage: true,
              addedBy: { id: 'u-1', name: 'Alice' },
              date: '2026-02-20',
            },
          ],
        },
      });

      const result = await callTool('get_attachments', { taskId: 't-1' });
      const data = parseToolResult<{
        taskId: string;
        count: number;
        attachments: { path: string; coverImage: boolean }[];
      }>(result);

      expect(data.taskId).toBe('t-1');
      expect(data.count).toBe(1);
      expect(data.attachments[0].path).toBe('/uploads/screenshot.png');
      expect(data.attachments[0].coverImage).toBe(true);
    });

    it('should handle task with no attachments', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        item: { id: 't-1', name: 'Task' },
      });

      const result = await callTool('get_attachments', { taskId: 't-1' });
      const data = parseToolResult<{ count: number; attachments: unknown[] }>(
        result,
      );

      expect(data.count).toBe(0);
      expect(data.attachments).toHaveLength(0);
    });
  });

  describe('download_attachment', () => {
    it('should return text content inline for text files', async () => {
      mockGraphqlClient.downloadAttachment.mockResolvedValue(
        Buffer.from('Hello, world!'),
      );

      const result = await callTool('download_attachment', {
        taskId: 't-1',
        path: '/uploads/notes.txt',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Hello, world!');
    });

    it('should return MCP image content for image files', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      mockGraphqlClient.downloadAttachment.mockResolvedValue(binaryData);

      const result = await callTool('download_attachment', {
        taskId: 't-1',
        path: '/uploads/image.png',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('image');
      expect(result.content[0].data).toBe(binaryData.toString('base64'));
      expect(result.content[0].mimeType).toBe('image/png');
    });

    it('should return a message for non-readable binary files', async () => {
      const pdfData = Buffer.from('%PDF-1.4 binary content');
      mockGraphqlClient.downloadAttachment.mockResolvedValue(pdfData);

      const result = await callTool('download_attachment', {
        taskId: 't-1',
        path: '/uploads/report.pdf',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('cannot be read');
      expect(result.content[0].text).toContain('report.pdf');
      expect(result.content[0].text).toContain(
        'not supported for content extraction',
      );
    });

    it('should throw when taskId is missing', async () => {
      await expect(
        callTool('download_attachment', { path: '/x' }),
      ).rejects.toThrow("download_attachment: 'taskId' is required");
    });

    it('should throw when path is missing', async () => {
      await expect(
        callTool('download_attachment', { taskId: 't-1' }),
      ).rejects.toThrow("download_attachment: 'path' is required");
    });
  });

  describe('delete_attachment', () => {
    it('should delete an attachment and return success', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        deleteItemAttachment: true,
      });

      const result = await callTool('delete_attachment', {
        taskId: 't-1',
        path: '/uploads/old-file.pdf',
      });
      const data = parseToolResult<{ success: boolean; deletedPath: string }>(
        result,
      );

      expect(data.success).toBe(true);
      expect(data.deletedPath).toBe('/uploads/old-file.pdf');
      const [, delVars, delToken] = getQueryCall(mockGraphqlClient.query, 0);
      expect(delVars).toEqual({ itemID: 't-1', path: '/uploads/old-file.pdf' });
      expect(delToken).toBe('test-token');
    });

    it('should throw when taskId is missing', async () => {
      await expect(
        callTool('delete_attachment', { path: '/x' }),
      ).rejects.toThrow("delete_attachment: 'taskId' is required");
    });

    it('should throw when path is missing', async () => {
      await expect(
        callTool('delete_attachment', { taskId: 't-1' }),
      ).rejects.toThrow("delete_attachment: 'path' is required");
    });
  });

  describe('set_cover_image', () => {
    it('should set a cover image', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        updateItemCoverImage: 't-1',
      });

      const result = await callTool('set_cover_image', {
        taskId: 't-1',
        path: '/uploads/hero.png',
      });
      const data = parseToolResult<{
        action: string;
        taskId: string | null;
      }>(result);

      expect(data.action).toBe('set');
      expect(data.taskId).toBe('t-1');
    });

    it('should clear the cover image when path is omitted', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        updateItemCoverImage: 't-1',
      });

      const result = await callTool('set_cover_image', { taskId: 't-1' });
      const data = parseToolResult<{
        action: string;
        taskId: string | null;
      }>(result);

      expect(data.action).toBe('cleared');
      expect(data.taskId).toBe('t-1');
    });
  });

  describe('update_comment', () => {
    it('should update an existing comment', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        updateComment: {
          id: 'c-1',
          text: 'Updated text',
          postedBy: { id: 'u-1', name: 'User' },
          postedAt: '2025-01-01T00:00:00Z',
        },
      });

      const result = await callTool('update_comment', {
        taskId: 't-1',
        commentId: 'c-1',
        text: 'Updated text',
      });

      expect(result.content[0].text).toContain('Updated text');
      const [, updateVars, updateToken] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(updateVars).toMatchObject({
        input: { id: 'c-1', itemID: 't-1', text: 'Updated text' },
      });

      expect(updateToken).toBe('test-token');
    });

    it('should throw when required fields are missing', async () => {
      await expect(
        callTool('update_comment', { commentId: 'c', text: 't' }),
      ).rejects.toThrow("update_comment: 'taskId' is required");
      await expect(
        callTool('update_comment', { taskId: 't', text: 't' }),
      ).rejects.toThrow("update_comment: 'commentId' is required");
      await expect(
        callTool('update_comment', { taskId: 't', commentId: 'c' }),
      ).rejects.toThrow("update_comment: 'text' is required");
    });
  });

  describe('delete_comment', () => {
    it('should delete a comment', async () => {
      mockGraphqlClient.query.mockResolvedValue({ deleteComment: 'c-1' });

      const result = await callTool('delete_comment', {
        taskId: 't-1',
        commentId: 'c-1',
      });
      const data = parseToolResult<{
        success: boolean;
        deletedCommentId: string;
      }>(result);

      expect(data.success).toBe(true);
      expect(data.deletedCommentId).toBe('c-1');
      const [, deleteVars, deleteToken] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(deleteVars).toMatchObject({
        input: { id: 'c-1', itemID: 't-1' },
      });
      expect(deleteToken).toBe('test-token');
    });

    it('should throw when required fields are missing', async () => {
      await expect(
        callTool('delete_comment', { commentId: 'c' }),
      ).rejects.toThrow("delete_comment: 'taskId' is required");
      await expect(callTool('delete_comment', { taskId: 't' })).rejects.toThrow(
        "delete_comment: 'commentId' is required",
      );
    });
  });
});
