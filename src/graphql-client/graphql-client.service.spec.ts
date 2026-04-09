// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { GraphQLClientService } from './graphql-client.service';

describe('GraphQLClientService', () => {
  let service: GraphQLClientService;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn().mockReturnValue(
        of({
          data: 'OK',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        }),
      ),
    } as unknown as jest.Mocked<HttpService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:8080'),
    } as unknown as jest.Mocked<ConfigService>;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphQLClientService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'LOGGER', useValue: mockLogger },
      ],
    }).compile();

    service = module.get<GraphQLClientService>(GraphQLClientService);
  });

  describe('login', () => {
    it('should return access token and user info on successful login', async () => {
      // Create a mock JWT with payload
      const payload = { sub: '123', username: 'testuser' };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
        'base64',
      );
      const mockToken = `header.${payloadBase64}.signature`;

      const mockResponse: AxiosResponse = {
        data: {
          data: {
            login: { access_token: mockToken },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.login('testuser', 'password123');

      expect(result.accessToken).toBe(mockToken);
      expect(result.user.id).toBe('123');
      expect(result.user.name).toBe('testuser');
    });

    it('should throw error on failed login', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          errors: [{ message: 'Invalid credentials' }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(service.login('baduser', 'wrongpass')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw error when no access token returned', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: { login: {} },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(service.login('user', 'pass')).rejects.toThrow(
        'No access token returned',
      );
    });
  });

  describe('query', () => {
    it('should execute GraphQL query and return data', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: {
            projects: [{ id: '1', name: 'Test Project' }],
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.query<{
        projects: Array<{ id: string; name: string }>;
      }>('query { projects { id name } }', {}, 'auth-token');

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Test Project');

      const [url, body, config] = mockHttpService.post.mock.calls[0] as [
        string,
        { query: string; variables: Record<string, unknown> },
        { headers: Record<string, string> },
      ];
      expect(url).toBe('http://localhost:8080/graphql');
      expect(body).toEqual({
        query: 'query { projects { id name } }',
        variables: {},
      });
      expect(config.headers.Authorization).toBe('Bearer auth-token');
    });

    it('should throw error on GraphQL errors', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          errors: [{ message: 'Project not found' }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(
        service.query(
          'query { project(id: "999") { id } }',
          { id: '999' },
          'token',
        ),
      ).rejects.toThrow('Project not found');
    });

    it('should throw error when no data returned', async () => {
      const mockResponse: AxiosResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(
        service.query('query { projects { id } }', {}, 'token'),
      ).rejects.toThrow('No data returned');
    });

    it('should handle 401 authentication errors', async () => {
      const axiosError = new AxiosError(
        'Request failed with status code 401',
        '401',
        undefined,
        undefined,
        {
          status: 401,
          data: {},
          statusText: 'Unauthorized',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        },
      );

      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.query('query { me { id } }', {}, 'invalid-token'),
      ).rejects.toThrow();
    });

    it('should include variables in request', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: { item: { id: '123', name: 'Task' } },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await service.query(
        'query GetTask($id: ID!) { item(id: $id) { id name } }',
        { id: '123' },
        'token',
      );

      const [, postBody] = mockHttpService.post.mock.calls[0] as [
        string,
        { query: string; variables: Record<string, unknown> },
      ];
      expect(typeof postBody.query).toBe('string');
      expect(postBody.variables).toEqual({ id: '123' });
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user info', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: {
            authenticatedUser: { id: '42', name: 'John Doe' },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.getCurrentUser('valid-token');

      expect(result.id).toBe('42');
      expect(result.name).toBe('John Doe');
    });
  });

  describe('healthcheck', () => {
    it('should return ok when GraphQL API is reachable', async () => {
      const mockResponse: AxiosResponse = {
        data: 'P4 Plan API is up and running',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.healthcheck();

      expect(result).toEqual({ ok: true, status: 200 });
    });

    it('should return not ok with status when API returns an error', async () => {
      const error = new AxiosError('Service Unavailable');
      error.response = {
        status: 503,
        statusText: 'Service Unavailable',
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.healthcheck();

      expect(result).toEqual({ ok: false, status: 503 });
    });

    it('should return not ok without status when API is unreachable', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('ECONNREFUSED')),
      );

      const result = await service.healthcheck();

      expect(result).toEqual({ ok: false });
    });
  });

  describe('onModuleInit', () => {
    it('should log the endpoint and healthcheck success', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: 'OK',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        }),
      );

      await service.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Checking GraphQL API endpoint: http://localhost:8080',
        'GraphQLClientService',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'GraphQL API healthcheck passed',
        'GraphQLClientService',
      );
    });

    it('should warn when API returns an error status', async () => {
      const error = new AxiosError('Bad Gateway');
      error.response = {
        status: 502,
        statusText: 'Bad Gateway',
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      await service.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GraphQL API returned HTTP 502 — MCP tools may fail',
        'GraphQLClientService',
      );
    });

    it('should warn when API is unreachable', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('ECONNREFUSED')),
      );

      await service.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GraphQL API unreachable at http://localhost:8080 — MCP tools will fail until it is available',
        'GraphQLClientService',
      );
    });
  });
});
