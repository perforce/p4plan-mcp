// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { TaskCommentsTools } from './task-comments.tools';
import type { UploadSource } from '../graphql-client/graphql-client.service';
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
      expect(names).toContain('upload_attachment');
      expect(names).toHaveLength(9);
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

  describe('upload_attachment', () => {
    let dir: string;
    let uploaded: { taskId: string; source: UploadSource; body: string }[];

    const attachment = (path: string, coverImage = false) => ({
      id: path,
      path,
      size: 5,
      version: 1,
      coverImage,
      addedBy: { id: 'u-1', name: 'Alice' },
      date: '2026-10-14',
    });

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'p4plan-upload-tool-'));
      mkdirSync(join(dir, 'shots'));
      writeFileSync(join(dir, 'shots', 'bug.png'), 'PNGDATA');
      uploaded = [];
      mockGraphqlClient.uploadAttachment = jest.fn(
        async (taskId: string, source: UploadSource) => {
          const chunks: Buffer[] = [];
          if (Buffer.isBuffer(source.data)) chunks.push(source.data);
          else
            for await (const chunk of source.data)
              chunks.push(Buffer.from(chunk as Buffer));
          uploaded.push({
            taskId,
            source,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
          return { p4PlanPath: 'hansoft://server/DocumentID/1' };
        },
      );
      tools = new TaskCommentsTools(
        mockGraphqlClient as unknown as GraphQLClientService,
        config({ uploadDirs: [dir] }),
      );
    });

    function config(values: Record<string, unknown>): ConfigService {
      return { get: (key: string) => values[key] } as unknown as ConfigService;
    }

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    async function upload(
      args: Record<string, unknown>,
      rootUris: string[] = [],
    ): Promise<McpToolResult> {
      const tool = tools.getTools().get('upload_attachment')!;
      return await tool.handler(args, 'test-token', {
        listRoots: () => Promise.resolve(rootUris),
      });
    }

    it('uploads text content and returns the new attachment path', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { attachments: [] } })
        .mockResolvedValueOnce({
          item: { attachments: [attachment('Att/crash.log')] },
        });

      const result = await upload({
        taskId: ' 42 ',
        content: 'stack trace',
        fileName: 'crash.log',
      });

      expect(uploaded).toHaveLength(1);
      expect(uploaded[0].taskId).toBe('42');
      expect(uploaded[0].body).toBe('stack trace');
      expect(uploaded[0].source).toMatchObject({
        fileName: 'crash.log',
        mimeType: 'text/plain',
        size: 11,
      });
      expect(parseToolResult(result)).toMatchObject({
        success: true,
        path: 'Att/crash.log',
      });
      expect(parseToolResult(result).renamed).toBeUndefined();
    });

    it('streams a local file from an allowed folder', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { attachments: [] } })
        .mockResolvedValueOnce({
          item: { attachments: [attachment('Att/bug.png', true)] },
        });

      const result = await upload({
        taskId: '42',
        filePath: join(dir, 'shots', 'bug.png'),
      });

      expect(uploaded[0].body).toBe('PNGDATA');
      expect(uploaded[0].source).toMatchObject({
        fileName: 'bug.png',
        mimeType: 'image/png',
        size: 7,
      });
      expect(parseToolResult(result)).toMatchObject({ coverImage: true });
    });

    it('returns an <img> tag for images so they can be shown inline', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { attachments: [] } })
        .mockResolvedValueOnce({
          item: { attachments: [attachment('Att/bug.png', true)] },
        });
      mockGraphqlClient.uploadAttachment = jest.fn().mockResolvedValue({
        p4PlanPath: 'hansoft://host/DocumentID/7?db=a"b&dbid=1',
      });

      const result = parseToolResult(
        await upload({ taskId: '42', filePath: join(dir, 'shots', 'bug.png') }),
      );

      expect(result).toMatchObject({
        path: 'Att/bug.png',
        p4PlanPath: 'hansoft://host/DocumentID/7?db=a"b&dbid=1',
        imageHtml:
          '<img src="hansoft://host/DocumentID/7?db=a&quot;b&amp;dbid=1">',
      });
    });

    it('returns no <img> tag for files that are not images', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { attachments: [] } })
        .mockResolvedValueOnce({
          item: { attachments: [attachment('Att/crash.log')] },
        });

      const result = parseToolResult(
        await upload({ taskId: '42', content: 'x', fileName: 'crash.log' }),
      );

      expect(result.p4PlanPath).toBe('hansoft://server/DocumentID/1');
      expect(result.imageHtml).toBeUndefined();
    });

    it('also accepts files inside the client roots', async () => {
      const other = mkdtempSync(join(tmpdir(), 'p4plan-upload-root-'));
      writeFileSync(join(other, 'notes.txt'), 'notes');
      mockGraphqlClient.query.mockResolvedValue({
        item: { attachments: [] },
      });
      tools = new TaskCommentsTools(
        mockGraphqlClient as unknown as GraphQLClientService,
      );

      try {
        await upload({ taskId: '42', filePath: join(other, 'notes.txt') }, [
          pathToFileURL(other).href,
        ]);
        expect(uploaded[0].body).toBe('notes');
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    it('names configured upload folders that do not exist', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });
      tools = new TaskCommentsTools(
        mockGraphqlClient as unknown as GraphQLClientService,
        config({ uploadDirs: ['/uploads-not-mounted', 'relative/dir'] }),
      );

      await expect(
        upload({ taskId: '42', filePath: '/uploads-not-mounted/a.txt' }),
      ).rejects.toThrow(
        'P4PLAN_UPLOAD_DIRS is set, but none of its folders can be used here (not an absolute path, or no such folder): "/uploads-not-mounted", "relative/dir"',
      );
      expect(uploaded).toHaveLength(0);
    });

    it('reports the name the server gave a duplicate', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({
          item: { attachments: [attachment('A/x.txt')] },
        })
        .mockResolvedValueOnce({
          item: {
            attachments: [attachment('A/x.txt'), attachment('A/x (1).txt')],
          },
        });

      const result = await upload({
        taskId: '42',
        content: 'again',
        fileName: 'x.txt',
      });

      expect(parseToolResult(result)).toMatchObject({ path: 'A/x (1).txt' });
      expect(String(parseToolResult(result).renamed)).toContain('x (1).txt');
    });

    it('falls back to get_attachments when the new entry is not visible', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });

      const result = await upload({
        taskId: '42',
        content: 'x',
        fileName: 'x.txt',
      });

      expect(parseToolResult(result)).toMatchObject({
        success: true,
        p4PlanPath: 'hansoft://server/DocumentID/1',
      });
      expect(result.content[0].text).toContain('get_attachments');
    });

    it.each([
      [{ taskId: '42' }, "give 'filePath'"],
      [
        { taskId: '42', filePath: '/a', content: 'x', fileName: 'x' },
        'not both',
      ],
      [{ taskId: '42', content: 'x' }, "'fileName' is required"],
      [{ content: 'x', fileName: 'x' }, "'taskId' is required"],
    ])('explains wrong arguments %j', async (args, expected) => {
      await expect(upload(args)).rejects.toThrow(expected);
      expect(uploaded).toHaveLength(0);
    });

    it('refuses a file outside the allowed folders without uploading', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });

      await expect(
        upload({ taskId: '42', filePath: '/etc/hosts' }),
      ).rejects.toThrow('outside the folders');
      expect(uploaded).toHaveLength(0);
    });

    it('runs parallel uploads one at a time, each seeing its own new attachment', async () => {
      let attachments: ReturnType<typeof attachment>[] = [];
      mockGraphqlClient.query.mockImplementation(() =>
        Promise.resolve({ item: { attachments: [...attachments] } }),
      );
      let running = 0;
      let maxRunning = 0;
      mockGraphqlClient.uploadAttachment = jest.fn(
        async (_taskId: string, source: UploadSource) => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          const taken = attachments.some(
            (a) => a.path === `A/${source.fileName}`,
          );
          attachments = [
            ...attachments,
            attachment(taken ? 'A/x (1).txt' : `A/${source.fileName}`),
          ];
          running--;
          return { p4PlanPath: 'hansoft://server/DocumentID/1' };
        },
      );

      const results = await Promise.all(
        ['x.txt', 'x.txt', 'y.txt'].map((fileName) =>
          upload({ taskId: '42', content: 'x', fileName }),
        ),
      );

      expect(maxRunning).toBe(1);
      expect(results.map((r) => parseToolResult(r).path)).toEqual([
        'A/x.txt',
        'A/x (1).txt',
        'A/y.txt',
      ]);
    });

    it('stops at the per-minute limit with a fix-it error', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });
      tools = new TaskCommentsTools(
        mockGraphqlClient as unknown as GraphQLClientService,
        config({ uploadDirs: [dir] }),
      );

      for (let i = 0; i < 20; i++) {
        await upload({ taskId: '42', content: 'a', fileName: `${i}.txt` });
      }
      await expect(
        upload({ taskId: '42', content: 'a', fileName: 'last.txt' }),
      ).rejects.toThrow('allows 20 uploads per minute');
      expect(uploaded).toHaveLength(20);
    });

    it('does not count refused files against the limit', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });
      tools = new TaskCommentsTools(
        mockGraphqlClient as unknown as GraphQLClientService,
        config({ uploadDirs: [dir] }),
      );

      for (let i = 0; i < 5; i++) {
        await expect(
          upload({ taskId: '42', filePath: '/etc/hosts' }),
        ).rejects.toThrow('outside the folders');
      }
      for (let i = 0; i < 20; i++) {
        await upload({ taskId: '42', content: 'a', fileName: `${i}.txt` });
      }
      expect(uploaded).toHaveLength(20);
    });

    it('accepts "#42" as an item ID and explains other non-numeric IDs', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });

      await upload({ taskId: '#42', content: 'x', fileName: 'x.txt' });
      expect(uploaded[0].taskId).toBe('42');
      await expect(
        upload({ taskId: '42/../x', content: 'x', fileName: 'x.txt' }),
      ).rejects.toThrow("must be the item's numeric ID");
      expect(uploaded).toHaveLength(1);
    });

    it('refuses empty files and empty content without uploading', async () => {
      mockGraphqlClient.query.mockResolvedValue({ item: { attachments: [] } });
      writeFileSync(join(dir, 'empty.txt'), '');

      await expect(
        upload({ taskId: '42', filePath: join(dir, 'empty.txt') }),
      ).rejects.toThrow('is empty (0 bytes)');
      await expect(
        upload({ taskId: '42', content: '', fileName: 'x.txt' }),
      ).rejects.toThrow("'content' is empty");
      expect(uploaded).toHaveLength(0);
    });

    it('checks the item before reading the file', async () => {
      mockGraphqlClient.query.mockRejectedValue(new Error('Invalid item ID'));

      await expect(
        upload({ taskId: '42', filePath: join(dir, 'shots', 'bug.png') }),
      ).rejects.toThrow('Invalid item ID');
      expect(uploaded).toHaveLength(0);
    });
  });
});
