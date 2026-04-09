// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable, Inject, type OnModuleInit } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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

interface JwtPayload {
  sub: string | number;
  username: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class GraphQLClientService implements OnModuleInit {
  private readonly graphqlUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('LOGGER') private readonly logger: LoggerService,
  ) {
    this.graphqlUrl = this.configService.get<string>('graphqlUrl') as string;
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
    try {
      this.logger.debug?.(
        `Downloading attachment: itemId=${itemId}, path=${path}`,
        GraphQLClientService.name,
      );

      const response = await firstValueFrom(
        this.httpService.post<ArrayBuffer>(
          `${this.graphqlUrl}/attachment/${itemId}`,
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
          throw new Error(
            `Attachment not found: item ${itemId}, path "${path}"`,
            { cause: error },
          );
        }
        throw new Error(`Attachment download failed: ${error.message}`, {
          cause: error,
        });
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
