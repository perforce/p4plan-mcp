// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Tests to validate GraphQL query/mutation strings are well-formed
 */
import * as authQueries from './auth.queries';
import * as projectQueries from './project.queries';
import * as userQueries from './user.queries';
import * as taskCrudQueries from './task-crud.queries';
import * as taskItemsQueries from './task-items.queries';
import * as taskCommentsQueries from './task-comments.queries';
import * as taskCustomFieldsQueries from './task-custom-fields.queries';
import * as taskActionsQueries from './task-actions.queries';

/**
 * Simple validator to check GraphQL query structure
 */
function isValidGraphQL(query: string): boolean {
  const trimmed = query.trim();

  // Must start with query, mutation, or subscription
  const startsCorrectly = /^(query|mutation|subscription)\s+\w+/i.test(trimmed);

  // Must have balanced braces
  const openBraces = (trimmed.match(/{/g) || []).length;
  const closeBraces = (trimmed.match(/}/g) || []).length;
  const balancedBraces = openBraces === closeBraces && openBraces > 0;

  // Must have balanced parentheses
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  const balancedParens = openParens === closeParens;

  return startsCorrectly && balancedBraces && balancedParens;
}

describe('GraphQL Queries Validation', () => {
  describe('auth.queries', () => {
    it('LOGIN_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(authQueries.LOGIN_MUTATION)).toBe(true);
      expect(authQueries.LOGIN_MUTATION).toContain('mutation');
      expect(authQueries.LOGIN_MUTATION).toContain('login');
      expect(authQueries.LOGIN_MUTATION).toContain('access_token');
    });

    it('VALIDATE_TOKEN_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(authQueries.VALIDATE_TOKEN_QUERY)).toBe(true);
      expect(authQueries.VALIDATE_TOKEN_QUERY).toContain('query');
      expect(authQueries.VALIDATE_TOKEN_QUERY).toContain('authenticatedUser');
    });
  });

  describe('project.queries', () => {
    it('LIST_PROJECTS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(projectQueries.LIST_PROJECTS_QUERY)).toBe(true);
      expect(projectQueries.LIST_PROJECTS_QUERY).toContain('userProjects');
    });

    it('GET_PROJECT_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(projectQueries.GET_PROJECT_QUERY)).toBe(true);
      expect(projectQueries.GET_PROJECT_QUERY).toContain('project(id: $id)');
    });
  });

  describe('user.queries', () => {
    it('GET_CURRENT_USER_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(userQueries.GET_CURRENT_USER_QUERY)).toBe(true);
      expect(userQueries.GET_CURRENT_USER_QUERY).toContain('authenticatedUser');
    });

    it('GET_PROJECT_USERS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(userQueries.GET_PROJECT_USERS_QUERY)).toBe(true);
      expect(userQueries.GET_PROJECT_USERS_QUERY).toContain('users');
    });
  });

  describe('task-crud.queries', () => {
    it('GET_PROJECT_SECTIONS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCrudQueries.GET_PROJECT_SECTIONS_QUERY)).toBe(
        true,
      );
      expect(taskCrudQueries.GET_PROJECT_SECTIONS_QUERY).toContain('backlog');
      expect(taskCrudQueries.GET_PROJECT_SECTIONS_QUERY).toContain('qa');
    });

    it('GET_TASK_TYPE_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCrudQueries.GET_TASK_TYPE_QUERY)).toBe(true);
      expect(taskCrudQueries.GET_TASK_TYPE_QUERY).toContain('__typename');
    });

    it('GET_TASKS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCrudQueries.GET_TASKS_QUERY)).toBe(true);
      expect(taskCrudQueries.GET_TASKS_QUERY).toContain(
        'itemsByIDs(ids: $ids)',
      );
    });

    it('CREATE_BACKLOG_TASKS_MUTATION should be valid GraphQL', () => {
      expect(
        isValidGraphQL(taskCrudQueries.CREATE_BACKLOG_TASKS_MUTATION),
      ).toBe(true);
      expect(taskCrudQueries.CREATE_BACKLOG_TASKS_MUTATION).toContain(
        'mutation',
      );
      expect(taskCrudQueries.CREATE_BACKLOG_TASKS_MUTATION).toContain(
        'createBacklogTasks',
      );
    });
  });

  describe('task-items.queries', () => {
    it('GET_TODO_LIST_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskItemsQueries.GET_TODO_LIST_QUERY)).toBe(true);
      expect(taskItemsQueries.GET_TODO_LIST_QUERY).toContain('todoList');
    });
  });

  describe('task-comments.queries', () => {
    it('GET_COMMENTS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCommentsQueries.GET_COMMENTS_QUERY)).toBe(true);
      expect(taskCommentsQueries.GET_COMMENTS_QUERY).toContain('comments');
    });

    it('POST_COMMENT_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCommentsQueries.POST_COMMENT_MUTATION)).toBe(
        true,
      );
      expect(taskCommentsQueries.POST_COMMENT_MUTATION).toContain(
        'postComment',
      );
    });

    it('GET_ATTACHMENTS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCommentsQueries.GET_ATTACHMENTS_QUERY)).toBe(
        true,
      );
      expect(taskCommentsQueries.GET_ATTACHMENTS_QUERY).toContain(
        'attachments',
      );
    });

    it('DELETE_ATTACHMENT_MUTATION should be valid GraphQL', () => {
      expect(
        isValidGraphQL(taskCommentsQueries.DELETE_ATTACHMENT_MUTATION),
      ).toBe(true);
      expect(taskCommentsQueries.DELETE_ATTACHMENT_MUTATION).toContain(
        'deleteItemAttachment',
      );
    });

    it('SET_COVER_IMAGE_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCommentsQueries.SET_COVER_IMAGE_MUTATION)).toBe(
        true,
      );
      expect(taskCommentsQueries.SET_COVER_IMAGE_MUTATION).toContain(
        'updateItemCoverImage',
      );
    });
  });

  describe('task-custom-fields.queries', () => {
    it('GET_WORKFLOWS_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(taskCustomFieldsQueries.GET_WORKFLOWS_QUERY)).toBe(
        true,
      );
      expect(taskCustomFieldsQueries.GET_WORKFLOWS_QUERY).toContain(
        'workflows',
      );
    });
  });

  describe('task-actions.queries', () => {
    it('COMMIT_TO_SPRINT_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(taskActionsQueries.COMMIT_TO_SPRINT_MUTATION)).toBe(
        true,
      );
      expect(taskActionsQueries.COMMIT_TO_SPRINT_MUTATION).toContain(
        'commitToSprint',
      );
    });

    it('GET_PROJECT_QA_QUERY should be valid GraphQL', () => {
      expect(isValidGraphQL(projectQueries.GET_PROJECT_QA_QUERY)).toBe(true);
      expect(projectQueries.GET_PROJECT_QA_QUERY).toContain('qa');
    });

    it('CREATE_BUG_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(taskActionsQueries.CREATE_BUG_MUTATION)).toBe(true);
      expect(taskActionsQueries.CREATE_BUG_MUTATION).toContain('createBugs');
    });

    it('CREATE_SCHEDULED_TASK_MUTATION should be valid GraphQL', () => {
      expect(
        isValidGraphQL(taskActionsQueries.CREATE_SCHEDULED_TASK_MUTATION),
      ).toBe(true);
      expect(taskActionsQueries.CREATE_SCHEDULED_TASK_MUTATION).toContain(
        'createScheduledTasks',
      );
    });

    it('UPDATE_SPRINT_MUTATION should be valid GraphQL', () => {
      expect(isValidGraphQL(taskActionsQueries.UPDATE_SPRINT_MUTATION)).toBe(
        true,
      );
      expect(taskActionsQueries.UPDATE_SPRINT_MUTATION).toContain(
        'updateSprint',
      );
      expect(taskActionsQueries.UPDATE_SPRINT_MUTATION).toContain(
        'allocations',
      );
    });
  });
});
