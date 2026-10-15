// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable, Inject, type OnModuleInit } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { LOGIN_MUTATION, VALIDATE_TOKEN_QUERY } from '../graphql';

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
}

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    name: string;
  };
}

/**
 * True only when every top-level definition of a GraphQL document is a
 * `query`, a `fragment` or a shorthand `{ ... }` query. This is an allowlist,
 * so it fails closed: mutations, subscriptions and anything it cannot
 * classify (malformed or unbalanced documents) are not read-only. String
 * literals and comments are skipped, so their content cannot hide a keyword.
 */
export function isReadOnlyDocument(document: string): boolean {
  const code = document.replace(
    /"""(?:\\"""|[\s\S])*?"""|"(?:\\.|[^"\\\n])*"|#[^\n\r]*/g,
    ' ',
  );
  let i = 0;
  let definitions = 0;

  const skipIgnored = () => {
    while (i < code.length && /[\s,]/.test(code[i])) i++;
  };
  // Skip the { ... } block that starts at code[i]; false if it never closes.
  const skipBlock = (): boolean => {
    for (let depth = 0; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) {
        i++;
        return true;
      }
    }
    return false;
  };

  for (skipIgnored(); i < code.length; skipIgnored()) {
    if (code[i] !== '{') {
      const keyword = /^[_A-Za-z]\w*/.exec(code.slice(i))?.[0];
      if (keyword !== 'query' && keyword !== 'fragment') return false;
      i += keyword.length;

      // Name, variables, directives and type condition up to the selection
      // set. Default values in (...) may contain braces of their own.
      let parens = 0;
      while (i < code.length && !(code[i] === '{' && parens === 0)) {
        if (code[i] === '(') parens++;
        else if (code[i] === ')' && --parens < 0) return false;
        else if (code[i] === '}' && parens === 0) return false;
        i++;
      }
    }
    if (!skipBlock()) return false;
    definitions++;
  }
  return definitions > 0;
}

/** A file to upload: either in memory or a stream of exactly `size` bytes. */
export interface UploadSource {
  fileName: string;
  mimeType: string;
  size: number;
  data: Buffer | Readable;
}

/**
 * filename parameters for a multipart part. The API reads a plain filename
 * as latin1, so non-ASCII names also go in filename* (RFC 5987).
 */
export function contentDispositionFileName(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  if (ascii === fileName) return `filename="${fileName}"`;
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function restErrorText(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return undefined;
}

function uploadErrorMessage(error: AxiosError, id: string): string {
  const status = error.response?.status;
  const serverText = restErrorText(error.response?.data);
  switch (status) {
    case 413:
      return `Upload rejected: the file is larger than the attachment size limit of this P4 Plan server (set by its administrator).`;
    case 400:
      if (/size/i.test(serverText ?? '')) {
        return `Upload rejected: the file is larger than the attachment size limit of this P4 Plan server (set by its administrator). Server said: ${serverText}.`;
      }
      if (/type/i.test(serverText ?? '')) {
        return `Upload rejected: this file type is blocked by the P4 Plan server (its administrator controls the blocked extensions). Server said: ${serverText}. Try another format the user agrees to (e.g. .jpg instead of .png), or tell the user to ask a P4 Plan administrator.`;
      }
      return `Upload rejected by the P4 Plan server: ${serverText ?? error.message}.`;
    case 401:
      return 'Authentication failed - invalid or expired token';
    case 403:
      return `Not allowed to add attachments to item ${id}: the user needs Document management access and the right to edit this item's attachments.`;
    case 404:
      return `Item ${id} not found: use the ID of a task, bug, sprint or release (the id returned by get_tasks or search_tasks).`;
    case 408:
      return `The upload to item ${id} timed out on the P4 Plan server, but it may still have completed. Call get_attachments for item ${id} before retrying; a retry adds a second copy named "name (1)".`;
    default:
      if (status && status >= 500) {
        return `The P4 Plan server could not store the attachment on item ${id} (HTTP ${status}${serverText ? `: ${serverText}` : ''}). This can mean the user has no Create right on the item's attachments folder.`;
      }
      return `Attachment upload failed: ${serverText ?? error.message}`;
  }
}

interface JwtPayload {
  sub: string | number;
  username: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class GraphQLClientService implements OnModuleInit {
  private readonly graphqlUrl: string;
  private readonly readOnly: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('LOGGER') private readonly logger: LoggerService,
  ) {
    this.graphqlUrl = this.configService.get<string>('graphqlUrl') as string;
    this.readOnly = this.configService.get<boolean>('readOnly') === true;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `Checking GraphQL API endpoint: ${this.graphqlUrl}`,
      GraphQLClientService.name,
    );

    const health = await this.healthcheck();
    if (health.ok) {
      this.logger.log(
        'GraphQL API healthcheck passed',
        GraphQLClientService.name,
      );
    } else if (health.status) {
      this.logger.warn?.(
        `GraphQL API returned HTTP ${health.status} — MCP tools may fail`,
        GraphQLClientService.name,
      );
    } else {
      this.logger.warn?.(
        `GraphQL API unreachable at ${this.graphqlUrl} — MCP tools will fail until it is available`,
        GraphQLClientService.name,
      );
    }
  }

  /**
   * Login to P4 Plan using username and password/PAT.
   * Returns a JWT token that can be used for subsequent requests.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<
          GraphQLResponse<{ login: { access_token: string } }>
        >(
          `${this.graphqlUrl}/graphql`,
          {
            query: LOGIN_MUTATION,
            variables: {
              loginUserInput: { username, password },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.data.errors && response.data.errors.length > 0) {
        const errorMessages = response.data.errors
          .map((error) => error.message)
          .join(', ');
        this.logger.error(
          `Login failed: ${errorMessages}`,
          GraphQLClientService.name,
        );
        throw new Error(`Login failed: ${errorMessages}`);
      }

      if (!response.data.data?.login?.access_token) {
        throw new Error('Login failed: No access token returned');
      }

      const accessToken = response.data.data.login.access_token;

      // Decode the JWT to get user info (JWT is base64 encoded, payload is second part)
      const payloadBase64 = accessToken.split('.')[1];
      if (!payloadBase64) {
        throw new Error('Login failed: Invalid JWT token format');
      }
      const payload: JwtPayload = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString('utf-8'),
      ) as JwtPayload;

      const user = {
        id: String(payload.sub),
        name: payload.username,
      };

      this.logger.log(
        `Login successful for user: ${user.name}`,
        GraphQLClientService.name,
      );

      return {
        accessToken,
        user,
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Login request failed: ${error.message}`,
          error.stack,
          GraphQLClientService.name,
        );
        throw new Error(`Login failed: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * Execute a GraphQL query or mutation against the P4 Plan GraphQL API.
   * The auth token from the MCP client is passed through to authenticate with GraphQL.
   */
  async query<T>(
    query: string,
    variables: Record<string, unknown>,
    authToken: string,
  ): Promise<T> {
    // Second layer under the tool filter: in read-only mode only plain
    // queries leave the server, even from a write tool wrongly marked as read.
    if (this.readOnly && !isReadOnlyDocument(query)) {
      throw new Error(
        'Blocked a GraphQL request that is not a plain query: this P4 Plan MCP server is running in read-only mode (--readonly / P4PLAN_READONLY), so nothing can be created, updated or deleted.',
      );
    }

    try {
      this.debugOperation(query, variables);

      const response = await firstValueFrom(
        this.httpService.post<GraphQLResponse<T>>(
          `${this.graphqlUrl}/graphql`,
          { query, variables },
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.data.errors && response.data.errors.length > 0) {
        const errorMessages = response.data.errors
          .map((error) => error.message)
          .join(', ');
        this.logger.error(
          `GraphQL errors: ${errorMessages}`,
          GraphQLClientService.name,
        );
        throw new Error(`GraphQL Error: ${errorMessages}`);
      }

      if (!response.data.data) {
        throw new Error('No data returned from GraphQL');
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const responseData = error.response?.data as
          | GraphQLResponse<unknown>
          | undefined;
        this.logger.error(
          `GraphQL request failed: ${error.message}`,
          error.stack,
          GraphQLClientService.name,
        );
        this.logger.error(
          `GraphQL query: ${query.substring(0, 500)}`,
          GraphQLClientService.name,
        );
        if (responseData) {
          this.logger.error(
            `GraphQL response: ${JSON.stringify(responseData)}`,
            GraphQLClientService.name,
          );
        }

        if (error.response?.status === 401) {
          throw new Error('Authentication failed - invalid or expired token', {
            cause: error,
          });
        }

        // Include the actual GraphQL error message in the thrown error
        const graphqlErrors = responseData?.errors;
        if (
          graphqlErrors &&
          Array.isArray(graphqlErrors) &&
          graphqlErrors.length > 0
        ) {
          const errorMsgs = graphqlErrors
            .map((error: { message: string }) => error.message)
            .join(', ');
          throw new Error(`GraphQL request failed: ${errorMsgs}`, {
            cause: error,
          });
        }
        throw new Error(`GraphQL request failed: ${error.message}`, {
          cause: error,
        });
      }
      if (error instanceof Error) {
        this.logger.error(
          `Unknown Error: ${error.message}`,
          error.stack,
          GraphQLClientService.name,
        );
      }

      throw error;
    }
  }

  /**
   * Get the current user from the GraphQL API to validate the auth token.
   */
  async getCurrentUser(
    authToken: string,
  ): Promise<{ id: string; name: string }> {
    const result = await this.query<{
      authenticatedUser: { id: string; name: string };
    }>(VALIDATE_TOKEN_QUERY, {}, authToken);

    return result.authenticatedUser;
  }

  /**
   * Download an attachment file from the P4 Plan REST API.
   * Uses the POST /attachments/:itemID endpoint (outside GraphQL).
   * Returns the raw file content as a Buffer.
   */
  async downloadAttachment(
    itemId: string,
    path: string,
    authToken: string,
  ): Promise<Buffer> {
    // itemId is part of the URL path: anything but a numeric ID could steer
    // this authenticated POST to another endpoint (e.g. "../graphql?query=...").
    const id = String(itemId).trim();
    if (!/^\d+$/.test(id)) {
      throw new Error(
        `Invalid task ID "${itemId}": expected a numeric task ID such as "1900555" (use the id returned by get_tasks or search_tasks).`,
      );
    }

    try {
      this.logger.debug?.(
        `Downloading attachment: itemId=${id}, path=${path}`,
        GraphQLClientService.name,
      );

      const response = await firstValueFrom(
        this.httpService.post<ArrayBuffer>(
          `${this.graphqlUrl}/attachment/${id}`,
          { path },
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
          },
        ),
      );

      return Buffer.from(response.data);
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Attachment download failed: ${error.message}`,
          error.stack,
          GraphQLClientService.name,
        );

        if (error.response?.status === 401) {
          throw new Error('Authentication failed - invalid or expired token', {
            cause: error,
          });
        }
        if (error.response?.status === 404) {
          throw new Error(`Attachment not found: item ${id}, path "${path}"`, {
            cause: error,
          });
        }
        throw new Error(`Attachment download failed: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Upload a file as an attachment (POST /attachment/:itemID/upload, a
   * multipart body with one part named "file"). The body is streamed.
   */
  async uploadAttachment(
    itemId: string,
    file: UploadSource,
    authToken: string,
  ): Promise<{ p4PlanPath?: string }> {
    if (this.readOnly) {
      throw new Error(
        'Blocked an attachment upload: this P4 Plan MCP server is running in read-only mode (--readonly / P4PLAN_READONLY), so nothing can be created, updated or deleted.',
      );
    }
    const id = String(itemId).trim();
    if (!/^\d+$/.test(id)) {
      throw new Error(
        `Invalid task ID "${itemId}": expected a numeric task ID such as "1900555" (use the id returned by get_tasks or search_tasks).`,
      );
    }

    const boundary = `----p4planmcp${randomBytes(16).toString('hex')}`;
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; ${contentDispositionFileName(file.fileName)}\r\n` +
        `Content-Type: ${file.mimeType}\r\n\r\n`,
      'utf-8',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Readable.from(
      (async function* () {
        yield head;
        let sent = 0;
        for await (const chunk of Buffer.isBuffer(file.data)
          ? [file.data]
          : file.data) {
          sent += (chunk as Buffer).length;
          yield chunk as Buffer;
        }
        // A shorter body than Content-Length would leave the request hanging.
        if (sent !== file.size) {
          throw new Error(
            `upload_attachment: "${file.fileName}" shrank from ${file.size} to ${sent} bytes while it was being uploaded (was it truncated or rotated?). Try again once the file has stopped changing.`,
          );
        }
        yield tail;
      })(),
    );

    this.logger.debug?.(
      `Uploading attachment: itemId=${id}, fileName=${file.fileName}, size=${file.size}`,
      GraphQLClientService.name,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ success?: boolean; p4PlanPath?: string }>(
          `${this.graphqlUrl}/attachment/${id}/upload`,
          body,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': String(head.length + file.size + tail.length),
            },
            // With redirects on, axios buffers the whole body (max 10 MB).
            maxRedirects: 0,
            maxBodyLength: Infinity,
          },
        ),
      );
      return { p4PlanPath: response.data?.p4PlanPath };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Attachment upload failed: ${error.message}`,
          error.stack,
          GraphQLClientService.name,
        );
        throw new Error(uploadErrorMessage(error, id), { cause: error });
      }
      throw error;
    }
  }

  /**
   * Lightweight healthcheck to verify the P4 Plan GraphQL API is reachable.
   * Uses the API's dedicated GET /healthcheck endpoint (no auth required).
   */
  async healthcheck(): Promise<{ ok: boolean; status?: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphqlUrl}/healthcheck`),
      );
      return { ok: true, status: response.status };
    } catch (error) {
      if (error instanceof AxiosError) {
        return { ok: false, status: error.response?.status };
      }
      return { ok: false };
    }
  }

  private debugOperation(
    query: string,
    variables: Record<string, unknown>,
  ): void {
    const match = query.match(/^\s*(query|mutation|subscription)\s+(\w+)/);
    const operationType = match?.[1] ?? 'unknown';
    const operationName = match?.[2] ?? 'unknown';

    const sanitizedVariables = JSON.stringify(
      variables,
      (key: string, value: unknown) =>
        /password|secret|pat/i.test(key) ? '******' : value,
      2,
    );

    this.logger.debug?.(
      `GraphQL ${operationType}: ${operationName} | Variables: ${sanitizedVariables}`,
      GraphQLClientService.name,
    );
  }
}
