// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { TaskToolsBase, validateRequired } from './task-helpers';
import { getQueryCall, MockGraphQLClient } from '../test-utils';

/**
 * Concrete implementation for testing the abstract TaskToolsBase
 */
class TestableTaskTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  // Expose protected methods for testing
  public testBuildUpdateMutation(taskType: string, returnFields: string) {
    return this.buildUpdateMutation(taskType, returnFields);
  }

  public async testGetProjectSections(projectId: string, authToken: string) {
    return this.getProjectSections(projectId, authToken);
  }

  public async testGetTaskType(taskId: string, authToken: string) {
    return this.getTaskType(taskId, authToken);
  }
}

describe('TaskToolsBase', () => {
  let mockGraphqlClient: MockGraphQLClient;
  let taskTools: TestableTaskTools;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    taskTools = new TestableTaskTools(
      mockGraphqlClient as unknown as GraphQLClientService,
    );
  });

  describe('buildUpdateMutation', () => {
    it('should build correct mutation for BacklogTask', () => {
      const result = taskTools.testBuildUpdateMutation(
        'BacklogTask',
        'id\nname\nstatus',
      );

      expect(result.resultKey).toBe('updateBacklogTask');
      expect(result.mutation).toContain('mutation UpdateBacklogTask');
      expect(result.mutation).toContain('UpdateBacklogTaskInput');
      expect(result.mutation).toContain(
        'updateBacklogTask(updateBacklogTaskInput: $input)',
      );
      expect(result.mutation).toContain('id\nname\nstatus');
    });

    it('should build correct mutation for Bug', () => {
      const result = taskTools.testBuildUpdateMutation('Bug', 'id\nname');

      expect(result.resultKey).toBe('updateBug');
      expect(result.mutation).toContain('mutation UpdateBug');
      expect(result.mutation).toContain('UpdateBugInput');
      expect(result.mutation).toContain('updateBug(updateBugInput: $input)');
    });

    it('should build correct mutation for ScheduledTask', () => {
      const result = taskTools.testBuildUpdateMutation(
        'ScheduledTask',
        'id\nname',
      );

      expect(result.resultKey).toBe('updateScheduledTask');
      expect(result.mutation).toContain('mutation UpdateScheduledTask');
      expect(result.mutation).toContain('UpdateScheduledTaskInput');
      expect(result.mutation).toContain(
        'updateScheduledTask(updateScheduledTaskInput: $input)',
      );
    });

    it('should fallback to BacklogTask for unknown types', () => {
      const result = taskTools.testBuildUpdateMutation('UnknownType', 'id');

      expect(result.resultKey).toBe('updateBacklogTask');
      expect(result.mutation).toContain('UpdateBacklogTaskInput');
    });

    it('should include all provided return fields', () => {
      const returnFields = `id
          name
          status
          assignedTo {
            user {
              id
              name
            }
          }`;
      const result = taskTools.testBuildUpdateMutation(
        'BacklogTask',
        returnFields,
      );

      expect(result.mutation).toContain('assignedTo');
      expect(result.mutation).toContain('user');
    });
  });

  describe('getProjectSections', () => {
    it('should return project sections from GraphQL response', async () => {
      const mockResponse = {
        project: {
          id: 'project-123',
          name: 'Test Project',
          backlog: { id: 'backlog-456' },
          qa: { id: 'qa-789' },
        },
      };

      mockGraphqlClient.query.mockResolvedValue(mockResponse);

      const result = await taskTools.testGetProjectSections(
        'project-123',
        'auth-token',
      );

      expect(result).toEqual({
        id: 'project-123',
        name: 'Test Project',
        backlogId: 'backlog-456',
        qaId: 'qa-789',
      });

      const [query, variables, token] = getQueryCall(
        mockGraphqlClient.query,
        0,
      );
      expect(query).toContain('query GetProjectSections');
      expect(variables).toEqual({ id: 'project-123' });
      expect(token).toBe('auth-token');
    });
  });

  describe('getTaskType', () => {
    it('should return task type from GraphQL response', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        item: { __typename: 'Bug' },
      });

      const result = await taskTools.testGetTaskType('task-123', 'auth-token');

      expect(result).toBe('Bug');
    });

    it('should handle BacklogTask type', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        item: { __typename: 'BacklogTask' },
      });

      const result = await taskTools.testGetTaskType('task-456', 'auth-token');

      expect(result).toBe('BacklogTask');
    });

    it('should handle ScheduledTask type', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        item: { __typename: 'ScheduledTask' },
      });

      const result = await taskTools.testGetTaskType('task-789', 'auth-token');

      expect(result).toBe('ScheduledTask');
    });
  });
});

describe('validateRequired', () => {
  it('should pass when all required fields are present', () => {
    const args = { taskId: 'abc-123', name: 'My Task' };
    expect(() =>
      validateRequired(args, ['taskId', 'name'], 'test_tool'),
    ).not.toThrow();
  });

  it('should throw when a field is undefined', () => {
    const args = { name: 'My Task' };
    expect(() => validateRequired(args, ['taskId'], 'update_task')).toThrow(
      "update_task: 'taskId' is required",
    );
  });

  it('should throw when a field is null', () => {
    const args = { taskId: null };
    expect(() => validateRequired(args, ['taskId'], 'get_task')).toThrow(
      "get_task: 'taskId' is required",
    );
  });

  it('should throw when a field is an empty string', () => {
    const args = { taskId: '' };
    expect(() => validateRequired(args, ['taskId'], 'get_task')).toThrow(
      "get_task: 'taskId' is required",
    );
  });

  it('should accept zero as a valid value', () => {
    const args = { points: 0 };
    expect(() =>
      validateRequired(args, ['points'], 'update_task'),
    ).not.toThrow();
  });

  it('should accept false as a valid value', () => {
    const args = { hidden: false };
    expect(() =>
      validateRequired(args, ['hidden'], 'update_task'),
    ).not.toThrow();
  });

  it('should report the first missing field when multiple are missing', () => {
    const args = {};
    expect(() =>
      validateRequired(args, ['projectId', 'name'], 'create_task'),
    ).toThrow("create_task: 'projectId' is required");
  });

  it('should include the tool name in the error message', () => {
    const args = {};
    expect(() => validateRequired(args, ['sprintId'], 'update_sprint')).toThrow(
      /^update_sprint:/,
    );
  });

  it('should pass with an empty required fields array', () => {
    expect(() => validateRequired({}, [], 'any_tool')).not.toThrow();
  });
});
