// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import type { UploadSource } from '../graphql-client/graphql-client.service';
import { McpToolResult, ToolCallContext } from './tools.service';
import {
  TaskToolsBase,
  ToolRegistration,
  validateRequired,
  READ_ONLY_ANNOTATIONS,
  writeAnnotations,
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
import {
  UPLOAD_DIRS_ENV,
  allowedUploadRoots,
  openUploadFile,
  validateAttachmentFileName,
} from './upload-file';
import { DEFAULT_UPLOADS_PER_MINUTE, UploadGate } from './upload-gate';

interface Attachment {
  id: string;
  path: string;
  size: number;
  version: number;
  imageWidth?: number;
  imageHeight?: number;
  coverImage: boolean;
  addedBy: { id: string; name: string };
  date: string;
}

interface UploadRequest {
  taskId: string;
  fileName: string;
  filePath?: string;
  content?: string;
}

function parseUploadArgs(args: Record<string, unknown>): UploadRequest {
  validateRequired(args, ['taskId'], 'upload_attachment');
  const taskId = String(args.taskId).trim().replace(/^#\s*/, '');
  if (!/^\d+$/.test(taskId)) {
    throw new Error(
      `upload_attachment: 'taskId' must be the item's numeric ID, e.g. "145202" (got ${JSON.stringify(args.taskId)}).`,
    );
  }
  const filePath =
    typeof args.filePath === 'string' ? args.filePath.trim() : '';
  const content = typeof args.content === 'string' ? args.content : undefined;
  const fileName = typeof args.fileName === 'string' ? args.fileName : '';

  if (filePath !== '') {
    if (content) {
      throw new Error(
        "upload_attachment: give either 'filePath' (a local file) or 'content' + 'fileName' (text), not both.",
      );
    }
    return { taskId, filePath, fileName };
  }
  if (content === undefined) {
    throw new Error(
      "upload_attachment: give 'filePath' (absolute path of a local file) or 'content' + 'fileName' (text to store as a file).",
    );
  }
  if (content === '') {
    throw new Error(
      "upload_attachment: 'content' is empty. P4 Plan cannot store empty attachments; write the text to attach in 'content'.",
    );
  }
  if (fileName.trim() === '') {
    throw new Error(
      'upload_attachment: \'fileName\' is required with \'content\', e.g. "crash.log" or "repro-steps.txt".',
    );
  }
  return { taskId, content, fileName };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
 * - upload_attachment: Upload a local file or text as an attachment
 * - delete_attachment: Delete an attachment
 * - set_cover_image: Set/unset cover image
 */
@Injectable()
export class TaskCommentsTools extends TaskToolsBase {
  private readonly uploadDirs: string[];
  private readonly uploadGate: UploadGate;

  constructor(
    graphqlClient: GraphQLClientService,
    @Optional() configService?: ConfigService,
  ) {
    super(graphqlClient);
    this.uploadDirs = configService?.get<string[]>('uploadDirs') ?? [];
    this.uploadGate = new UploadGate(
      configService?.get<number>('uploadsPerMinute') ??
        DEFAULT_UPLOADS_PER_MINUTE,
    );
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      handler: (args, authToken) => this.getComments(args, authToken),
    });

    // post_comment
    tools.set('post_comment', {
      definition: {
        name: 'post_comment',
        description:
          'Post a comment on a task or item. Use for posting questions, acceptance criteria, blockers, or general discussion. Comment text is sanitized HTML — call read_skill with skillName="comment-html-format" before composing the text, and skillName="mentions" if the comment includes @user references.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the task to comment on',
            },
            text: {
              type: 'string',
              description:
                'Comment text in sanitized HTML format. See the comment-html-format skill for the allowed tag/CSS subset and the mentions skill for @user references.',
            },
          },
          required: ['taskId', 'text'],
        },
        annotations: writeAnnotations({
          destructive: false,
          idempotent: false,
        }),
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
        annotations: READ_ONLY_ANNOTATIONS,
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      handler: (args, authToken) =>
        this.downloadAttachmentFile(args, authToken),
    });

    // upload_attachment
    tools.set('upload_attachment', {
      definition: {
        name: 'upload_attachment',
        description:
          'Attach a file to a task, bug, sprint or release, e.g. a screenshot or log for a bug report. Give exactly one of:\n' +
          '- filePath: absolute path of a local file. Only files inside the folders this server may read are allowed: the workspace folders your MCP client shares (roots) and the folders in ' +
          UPLOAD_DIRS_ENV +
          '. Hidden files and folders (names starting with ".") are refused. With Docker, the path must be inside a mounted folder listed in ' +
          UPLOAD_DIRS_ENV +
          '.\n' +
          '- content + fileName: text you write yourself (log excerpt, repro steps), stored as a file named fileName.\n' +
          'The P4 Plan server limits size and blocks some file types. If a file with the same name exists, the server adds "name (1)". The first image attached becomes the cover image. Uploads run one at a time and are limited per minute (every upload sent to the server counts, also ones it rejects); if the limit is reached, wait instead of retrying. ' +
          'Returns the attachment path for download_attachment, delete_attachment and set_cover_image. ' +
          'For images it also returns imageHtml, an <img> tag that shows the image inline when put in a comment, detailedDescription, stepsToReproduce or Multiline Text field of the same item.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The ID of the item to attach the file to',
            },
            filePath: {
              type: 'string',
              description:
                'Absolute path of the local file to upload (inside an allowed folder). Leave out when using content.',
            },
            content: {
              type: 'string',
              description:
                'Text to upload as a file instead of a local file. Requires fileName.',
            },
            fileName: {
              type: 'string',
              description:
                'Name for the attachment, e.g. "crash.log". Required with content; with filePath it defaults to the file\'s own name.',
            },
          },
          required: ['taskId'],
        },
        annotations: writeAnnotations({
          destructive: false,
          idempotent: false,
        }),
      },
      handler: (args, authToken, context) =>
        this.uploadAttachment(args, authToken, context),
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
        annotations: writeAnnotations({
          destructive: true,
          idempotent: true,
        }),
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
        annotations: writeAnnotations({
          destructive: true,
          idempotent: true,
        }),
      },
      handler: (args, authToken) => this.setCoverImage(args, authToken),
    });

    // update_comment
    tools.set('update_comment', {
      definition: {
        name: 'update_comment',
        description:
          'Edit the text of an existing comment. Get comment IDs from get_comments first. Comment text is sanitized HTML — call read_skill with skillName="comment-html-format" before composing the text, and skillName="mentions" if the comment includes @user references.',
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
              description:
                'New comment text in sanitized HTML format. See the comment-html-format skill for the allowed tag/CSS subset and the mentions skill for @user references.',
            },
          },
          required: ['taskId', 'commentId', 'text'],
        },
        annotations: writeAnnotations({
          destructive: true,
          idempotent: true,
        }),
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
        annotations: writeAnnotations({
          destructive: true,
          idempotent: true,
        }),
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
        attachments?: Attachment[];
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

  private async listAttachments(
    taskId: string,
    authToken: string,
  ): Promise<Attachment[]> {
    const result = await this.graphqlClient.query<{
      item: { attachments?: Attachment[] | null };
    }>(GET_ATTACHMENTS_QUERY, { id: taskId }, authToken);
    return result.item.attachments ?? [];
  }

  private async uploadAttachment(
    args: Record<string, unknown>,
    authToken: string,
    context?: ToolCallContext,
  ): Promise<McpToolResult> {
    const request = parseUploadArgs(args);
    return this.uploadGate.run(() =>
      this.sendUpload(request, authToken, context),
    );
  }

  private async sendUpload(
    request: UploadRequest,
    authToken: string,
    context?: ToolCallContext,
  ): Promise<McpToolResult> {
    const { taskId } = request;
    this.uploadGate.check();
    const before = await this.listAttachments(taskId, authToken);
    const { source, close } = await this.openUploadSource(request, context);

    let p4PlanPath: string | undefined;
    try {
      this.uploadGate.take();
      ({ p4PlanPath } = await this.graphqlClient.uploadAttachment(
        taskId,
        source,
        authToken,
      ));
    } finally {
      await close();
    }

    const known = new Set(before.map((attachment) => attachment.path));
    const added = (await this.listAttachments(taskId, authToken)).filter(
      (attachment) => !known.has(attachment.path),
    );
    const attachment = added.length === 1 ? added[0] : undefined;
    const storedName = attachment?.path.split('/').pop();
    const isImage = source.mimeType.startsWith('image/');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId,
            fileName: source.fileName,
            path: attachment?.path,
            size: attachment?.size ?? source.size,
            coverImage: attachment?.coverImage,
            renamed:
              storedName && storedName !== source.fileName
                ? `A file named "${source.fileName}" already existed, so the server stored this one as "${storedName}".`
                : undefined,
            p4PlanPath,
            imageHtml:
              isImage && p4PlanPath
                ? `<img src="${escapeHtmlAttribute(p4PlanPath)}">`
                : undefined,
            note: attachment
              ? undefined
              : 'Uploaded. Call get_attachments to see the attachment path.',
          }),
        },
      ],
    };
  }

  private async openUploadSource(
    request: UploadRequest,
    context?: ToolCallContext,
  ): Promise<{ source: UploadSource; close: () => Promise<void> }> {
    if (request.content !== undefined) {
      const fileName = validateAttachmentFileName(request.fileName);
      const data = Buffer.from(request.content, 'utf-8');
      return {
        source: {
          fileName,
          mimeType: this.getMimeType(fileName),
          size: data.length,
          data,
        },
        close: () => Promise.resolve(),
      };
    }

    const clientRoots = (await context?.listRoots?.().catch(() => [])) ?? [];
    const file = await openUploadFile(
      request.filePath ?? '',
      await allowedUploadRoots(clientRoots, this.uploadDirs),
    );
    try {
      if (file.size === 0) {
        throw new Error(
          `upload_attachment: "${file.name}" is empty (0 bytes). P4 Plan cannot store empty attachments; tell the user.`,
        );
      }
      const fileName = validateAttachmentFileName(
        request.fileName || file.name,
      );
      return {
        source: {
          fileName,
          mimeType: this.getMimeType(fileName),
          size: file.size,
          data: file.handle.createReadStream({
            start: 0,
            end: file.size - 1,
            autoClose: false,
          }),
        },
        close: () => file.handle.close(),
      };
    } catch (error) {
      await file.handle.close();
      throw error;
    }
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
