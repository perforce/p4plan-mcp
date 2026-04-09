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
  GET_COMMENTS_QUERY,
  POST_COMMENT_MUTATION,
  GET_ATTACHMENTS_QUERY,
  DELETE_ATTACHMENT_MUTATION,
  SET_COVER_IMAGE_MUTATION,
  UPDATE_COMMENT_MUTATION,
  DELETE_COMMENT_MUTATION,
} from '../graphql';

/**
 * Task Comments & Attachments Tools
 *
 * Handles comments and attachments:
 * - get_comments: Get comments on a task
 * - post_comment: Post a comment on a task
 * - update_comment: Edit an existing comment
 * - delete_comment: Delete a comment
 * - get_attachments: List attachments on a task
 * - download_attachment: Download an attachment file's content
 * - delete_attachment: Delete an attachment
 * - set_cover_image: Set/unset cover image
 */
@Injectable()
export class TaskCommentsTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // get_comments
    tools.set('get_comments', {
      definition: {
        name: 'get_comments',
        description:
          'Get all comments on a task or item. Returns comment text, author, and timestamp for each comment.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task to get comments for',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.getComments(args, authToken),
    });

    // post_comment
    tools.set('post_comment', {
      definition: {
        name: 'post_comment',
        description:
          'Post a comment on a task or item. Use for posting questions, acceptance criteria, blockers, or general discussion.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task to comment on',
            },
            text: {
              type: 'string',
              description: 'The comment text',
            },
          },
          required: ['taskId', 'text'],
        },
      },
      handler: (args, authToken) => this.postComment(args, authToken),
    });

    // get_attachments
    tools.set('get_attachments', {
      definition: {
        name: 'get_attachments',
        description:
          'List all attachments on a task. Returns attachment details including path, size, and whether it is the cover image. Use download_attachment to retrieve the actual file content.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to get attachments from',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.getAttachments(args, authToken),
    });

    // download_attachment
    tools.set('download_attachment', {
      definition: {
        name: 'download_attachment',
        description:
          'Download and return the actual content of an attachment file. Use get_attachments first to find available paths.\n' +
          'Supported file types:\n' +
          '- Text/code: .txt, .md, .csv, .json, .xml, .html, .css, .js, .ts, .py, .java, .c, .cpp, .cs, .go, .rs, .sh, .sql, .yaml, .svg, and more\n' +
          '- Images (rendered for vision): .png, .jpg, .jpeg, .gif, .webp\n' +
          '- Unsupported (binary): .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .zip, .gz — these return a descriptive message only',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task the attachment belongs to',
            },
            path: {
              type: 'string',
              description:
                'The path of the attachment to download (from get_attachments)',
            },
          },
          required: ['taskId', 'path'],
        },
      },
      handler: (args, authToken) =>
        this.downloadAttachmentFile(args, authToken),
    });

    // delete_attachment
    tools.set('delete_attachment', {
      definition: {
        name: 'delete_attachment',
        description:
          'Delete an attachment from a task. Use get_attachments first to find the attachment path.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to delete the attachment from',
            },
            path: {
              type: 'string',
              description:
                'The path of the attachment to delete (from get_attachments)',
            },
          },
          required: ['taskId', 'path'],
        },
      },
      handler: (args, authToken) => this.deleteAttachment(args, authToken),
    });

    // set_cover_image
    tools.set('set_cover_image', {
      definition: {
        name: 'set_cover_image',
        description:
          'Set or unset the cover image for a task. The attachment must be an image that is already attached to the task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to set the cover image on',
            },
            path: {
              type: 'string',
              description:
                'The path of the image attachment to set as cover. Omit or set to null to remove the cover image.',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.setCoverImage(args, authToken),
    });

    // update_comment
    tools.set('update_comment', {
      definition: {
        name: 'update_comment',
        description:
          'Edit the text of an existing comment. Get comment IDs from get_comments first.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task the comment belongs to',
            },
            commentId: {
              type: 'string',
              description:
                'The ID of the comment to update (from get_comments)',
            },
            text: {
              type: 'string',
              description: 'The new comment text',
            },
          },
          required: ['taskId', 'commentId', 'text'],
        },
      },
      handler: (args, authToken) => this.updateComment(args, authToken),
    });

    // delete_comment
    tools.set('delete_comment', {
      definition: {
        name: 'delete_comment',
        description:
          'Delete a comment from a task. This action cannot be undone. Get comment IDs from get_comments first.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task the comment belongs to',
            },
            commentId: {
              type: 'string',
              description:
                'The ID of the comment to delete (from get_comments)',
            },
          },
          required: ['taskId', 'commentId'],
        },
      },
      handler: (args, authToken) => this.deleteComment(args, authToken),
    });

    return tools;
  }

  private async getComments(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId'], 'get_comments');
    const taskId = args.taskId as string;

    const result = await this.graphqlClient.query<{
      comments: Array<{
        id: string;
        text: string;
        postedBy: { id: string; name: string };
        postedAt: string;
      }>;
    }>(GET_COMMENTS_QUERY, { id: taskId }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId,
            count: result.comments.length,
            comments: result.comments,
          }),
        },
      ],
    };
  }

  private async postComment(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'text'], 'post_comment');
    const taskId = args.taskId as string;
    const text = args.text as string;

    const result = await this.graphqlClient.query<{
      postComment: {
        id: string;
        text: string;
        postedBy: { id: string; name: string };
        postedAt: string;
      };
    }>(POST_COMMENT_MUTATION, { input: { itemID: taskId, text } }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: `Comment posted: ${JSON.stringify(result.postComment)}`,
        },
      ],
    };
  }

  private async getAttachments(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const taskId = args.taskId as string;

    const result = await this.graphqlClient.query<{
      item: {
        id: string;
        name: string;
        attachments?: Array<{
          id: string;
          path: string;
          size: number;
          version: number;
          imageWidth?: number;
          imageHeight?: number;
          coverImage: boolean;
          addedBy: { id: string; name: string };
          date: string;
        }>;
      };
    }>(GET_ATTACHMENTS_QUERY, { id: taskId }, authToken);

    const attachments = result.item.attachments || [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId,
            taskName: result.item.name,
            count: attachments.length,
            attachments,
          }),
        },
      ],
    };
  }

  private async downloadAttachmentFile(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'path'], 'download_attachment');
    const taskId = args.taskId as string;
    const path = args.path as string;

    return this.downloadFile(taskId, path, authToken);
  }

  /** Download a single attachment and return content appropriate for LLM consumption. */
  private async downloadFile(
    taskId: string,
    downloadPath: string,
    authToken: string,
  ): Promise<McpToolResult> {
    const buffer = await this.graphqlClient.downloadAttachment(
      taskId,
      downloadPath,
      authToken,
    );

    const fileName = downloadPath.split('/').pop() ?? downloadPath;
    const mimeType = this.getMimeType(fileName);

    // Text file — return content inline for direct analysis
    if (this.isTextMimeType(mimeType)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: buffer.toString('utf-8'),
          },
        ],
      };
    }

    // Image file — return as MCP image content for vision analysis
    if (this.isImageMimeType(mimeType)) {
      return {
        content: [
          {
            type: 'image' as const,
            data: buffer.toString('base64'),
            mimeType,
          },
        ],
      };
    }

    // Other binary — not directly readable by LLMs
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `Binary file "${fileName}" (${mimeType}, ${buffer.length} bytes) cannot be read. ` +
            'This file type is not supported for content extraction. ' +
            'Supported types: text/code files (.txt, .md, .csv, .json, .xml, .js, .ts, .py, etc.) and images (.png, .jpg, .gif, .webp). ' +
            'To analyze this file, the user would need to convert it to a supported format or provide its contents directly.',
        },
      ],
    };
  }

  private async deleteAttachment(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'path'], 'delete_attachment');
    const taskId = args.taskId as string;
    const path = args.path as string;

    const result = await this.graphqlClient.query<{
      deleteItemAttachment: boolean;
    }>(DELETE_ATTACHMENT_MUTATION, { itemID: taskId, path }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: result.deleteItemAttachment,
            taskId,
            deletedPath: path,
          }),
        },
      ],
    };
  }

  private async setCoverImage(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    const taskId = args.taskId as string;
    const path = (args.path as string | undefined) || null;

    await this.graphqlClient.query<{
      updateItemCoverImage: string;
    }>(SET_COVER_IMAGE_MUTATION, { itemID: taskId, path }, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId,
            action: path ? 'set' : 'cleared',
          }),
        },
      ],
    };
  }

  private async updateComment(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'commentId', 'text'], 'update_comment');
    const taskId = args.taskId as string;
    const commentId = args.commentId as string;
    const text = args.text as string;

    const result = await this.graphqlClient.query<{
      updateComment: {
        id: string;
        text: string;
        postedBy: { id: string; name: string };
        postedAt: string;
      };
    }>(
      UPDATE_COMMENT_MUTATION,
      { input: { id: commentId, itemID: taskId, text } },
      authToken,
    );

    return {
      content: [
        {
          type: 'text',
          text: `Comment updated: ${JSON.stringify(result.updateComment)}`,
        },
      ],
    };
  }

  private async deleteComment(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId', 'commentId'], 'delete_comment');
    const taskId = args.taskId as string;
    const commentId = args.commentId as string;

    const result = await this.graphqlClient.query<{
      deleteComment: string;
    }>(
      DELETE_COMMENT_MUTATION,
      { input: { id: commentId, itemID: taskId } },
      authToken,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            deletedCommentId: result.deleteComment,
            taskId,
          }),
        },
      ],
    };
  }

  /** Map common file extensions to MIME types. */
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const mimeTypes: Record<string, string> = {
      // Text / code
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      ts: 'application/typescript',
      py: 'text/x-python',
      java: 'text/x-java-source',
      c: 'text/x-c',
      cpp: 'text/x-c++',
      h: 'text/x-c',
      cs: 'text/x-csharp',
      rb: 'text/x-ruby',
      go: 'text/x-go',
      rs: 'text/x-rust',
      sh: 'text/x-shellscript',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      toml: 'text/plain',
      ini: 'text/plain',
      cfg: 'text/plain',
      conf: 'text/plain',
      log: 'text/plain',
      sql: 'text/x-sql',
      graphql: 'text/plain',
      svg: 'image/svg+xml',
      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Archives
      zip: 'application/zip',
      gz: 'application/gzip',
      tar: 'application/x-tar',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }

  /** Determine whether a MIME type represents a text-readable file. */
  private isTextMimeType(mimeType: string): boolean {
    if (mimeType.startsWith('text/')) return true;
    const textMimeTypes = [
      'application/json',
      'application/xml',
      'application/javascript',
      'application/typescript',
      'image/svg+xml',
    ];
    return textMimeTypes.includes(mimeType);
  }

  /** Determine whether a MIME type is an image that LLM vision can analyze. */
  private isImageMimeType(mimeType: string): boolean {
    const visionTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    return visionTypes.includes(mimeType);
  }
}
