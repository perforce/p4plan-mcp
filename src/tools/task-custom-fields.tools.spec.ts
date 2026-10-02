// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { TaskCustomFieldsTools } from './task-custom-fields.tools';
import { McpToolResult } from './tools.service';
import {
  parseToolResult,
  getQueryCall,
  getLastQueryCall,
  MockGraphQLClient,
} from '../test-utils';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';

describe('TaskCustomFieldsTools', () => {
  let tools: TaskCustomFieldsTools;
  let mockGraphqlClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphqlClient = {
      query: jest.fn(),
      login: jest.fn(),
      getCurrentUser: jest.fn(),
      downloadAttachment: jest.fn(),
    };

    tools = new TaskCustomFieldsTools(
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
      expect(names).toContain('get_custom_columns');
      expect(names).toContain('get_custom_fields');
      expect(names).toContain('set_custom_field');
      expect(names).toContain('create_custom_column');
      expect(names).toContain('get_workflows');
      expect(names).toHaveLength(5);
    });
  });

  describe('get_custom_columns', () => {
    it('should return custom columns filtering out DefaultColumn', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        columns: [
          {
            id: 'col-1',
            projectID: 'p-1',
            name: 'Priority',
            readOnly: false,
            __typename: 'DefaultColumn',
          },
          {
            id: 'col-2',
            projectID: 'p-1',
            name: 'Sprint Goal',
            readOnly: false,
            __typename: 'TextCustomColumn',
            activated: true,
          },
          {
            id: 'col-3',
            projectID: 'p-1',
            name: 'Category',
            readOnly: false,
            __typename: 'SingleSelectionDropListCustomColumn',
            activated: true,
            items: [
              { id: 'i-1', name: 'Frontend' },
              { id: 'i-2', name: 'Backend' },
            ],
          },
        ],
      });

      const result = await callTool('get_custom_columns', { projectId: 'p-1' });
      const data = parseToolResult<{
        count: number;
        columns: { name: string }[];
      }>(result);

      expect(data.count).toBe(2);
      expect(data.columns.map((column) => column.name)).toEqual([
        'Sprint Goal',
        'Category',
      ]);
    });

    it('should use activeColumns query when activeOnly is true', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        activeColumns: [
          {
            id: 'col-2',
            projectID: 'p-1',
            name: 'Sprint Goal',
            readOnly: false,
            __typename: 'TextCustomColumn',
            activated: true,
          },
        ],
      });

      const result = await callTool('get_custom_columns', {
        projectId: 'p-1',
        activeOnly: true,
      });
      const data = parseToolResult<{ activeOnly: boolean; count: number }>(
        result,
      );

      expect(data.activeOnly).toBe(true);
      expect(data.count).toBe(1);

      const [query, , token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(query).toContain('activeColumns');
      expect(token).toBe('test-token');
    });

    it('should throw when projectId is missing', async () => {
      await expect(callTool('get_custom_columns', {})).rejects.toThrow(
        "get_custom_columns: 'projectId' is required",
      );
    });
  });

  describe('get_custom_fields', () => {
    it('should return custom field values for a task', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        customFields: [
          {
            id: 'cf-1',
            taskID: 't-1',
            __typename: 'TextCustomField',
            value: 'Hello',
          },
          {
            id: 'cf-2',
            taskID: 't-1',
            __typename: 'NumberCustomField',
            intValue: 42,
          },
        ],
      });

      const result = await callTool('get_custom_fields', { taskId: 't-1' });
      const data = parseToolResult<{
        taskId: string;
        onlySet: boolean;
        count: number;
      }>(result);

      expect(data.taskId).toBe('t-1');
      expect(data.onlySet).toBe(false);
      expect(data.count).toBe(2);
    });

    it('should use customFieldsSet query when onlySet is true', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        customFieldsSet: [
          {
            id: 'cf-1',
            taskID: 't-1',
            __typename: 'TextCustomField',
            value: 'Set value',
          },
        ],
      });

      const result = await callTool('get_custom_fields', {
        taskId: 't-1',
        onlySet: true,
      });
      const data = parseToolResult<{ onlySet: boolean; count: number }>(result);

      expect(data.onlySet).toBe(true);
      expect(data.count).toBe(1);
      const [query, , token] = getQueryCall(mockGraphqlClient.query, 0);
      expect(query).toContain('customFieldsSet');
      expect(token).toBe('test-token');
    });

    it('should throw when taskId is missing', async () => {
      await expect(callTool('get_custom_fields', {})).rejects.toThrow(
        "get_custom_fields: 'taskId' is required",
      );
    });
  });

  describe('set_custom_field', () => {
    it('should set a text custom field', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [{ id: 'col-1', __typename: 'TextCustomColumn' }],
        })
        .mockResolvedValueOnce({ setTextCustomFieldValue: { id: 'cf-1' } });

      const result = await callTool('set_custom_field', {
        taskId: 't-1',
        customFieldId: 'col-1',
        value: 'Hello world',
      });
      const data = parseToolResult<{ success: boolean; columnType: string }>(
        result,
      );

      expect(data.success).toBe(true);
      expect(data.columnType).toBe('TextCustomColumn');
    });

    it('should set a number custom field with integer conversion', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [{ id: 'col-2', __typename: 'NumberCustomColumn' }],
        })
        .mockResolvedValueOnce({ setNumberCustomFieldValue: { id: 'cf-2' } });

      await callTool('set_custom_field', {
        taskId: 't-1',
        customFieldId: 'col-2',
        value: '42',
      });

      const lastCall = getLastQueryCall(mockGraphqlClient.query);
      expect(lastCall[1]).toMatchObject({ value: 42 });
      expect(lastCall[2]).toBe('test-token');
    });

    it('should set a single selection drop list field', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [
            { id: 'col-3', __typename: 'SingleSelectionDropListCustomColumn' },
          ],
        })
        .mockResolvedValueOnce({
          setSingleSelectionDropListCustomFieldValue: { id: 'cf-3' },
        });

      await callTool('set_custom_field', {
        taskId: 't-1',
        customFieldId: 'col-3',
        value: 'item-id-42',
      });

      const lastCall = getLastQueryCall(mockGraphqlClient.query);
      expect(lastCall[1]).toMatchObject({ value: 'item-id-42' });
      expect(lastCall[2]).toBe('test-token');
    });

    it('should split comma-separated IDs for multiple selection drop list', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [
            {
              id: 'col-4',
              __typename: 'MultipleSelectionDropListCustomColumn',
            },
          ],
        })
        .mockResolvedValueOnce({
          setMultipleSelectionDropListCustomFieldValue: { id: 'cf-4' },
        });

      await callTool('set_custom_field', {
        taskId: 't-1',
        customFieldId: 'col-4',
        value: 'id-1, id-2, id-3',
      });

      const lastCall = getLastQueryCall(mockGraphqlClient.query);
      expect(lastCall[1]).toMatchObject({ value: ['id-1', 'id-2', 'id-3'] });
      expect(lastCall[2]).toBe('test-token');
    });

    it('should set a user custom field with comma-separated user IDs', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [{ id: 'col-u', __typename: 'UserCustomColumn' }],
        })
        .mockResolvedValueOnce({ setUserCustomFieldValue: { id: 'cf-u' } });

      await callTool('set_custom_field', {
        taskId: 't-1',
        customFieldId: 'col-u',
        value: 'user-1, user-2',
      });

      const lastCall = getLastQueryCall(mockGraphqlClient.query);
      expect(lastCall[1]).toMatchObject({
        usersAndGroups: { users: ['user-1', 'user-2'], groups: [] },
      });
      expect(lastCall[2]).toBe('test-token');
    });

    it('should throw for unsupported custom field type', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({
          columns: [{ id: 'col-x', __typename: 'UnknownCustomColumn' }],
        });

      await expect(
        callTool('set_custom_field', {
          taskId: 't-1',
          customFieldId: 'col-x',
          value: 'v',
        }),
      ).rejects.toThrow('Unsupported custom field type: UnknownCustomColumn');
    });

    it('should throw when custom field ID is not found', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ item: { id: 't-1', projectID: 'p-1' } })
        .mockResolvedValueOnce({ columns: [] });

      await expect(
        callTool('set_custom_field', {
          taskId: 't-1',
          customFieldId: 'nonexistent',
          value: 'v',
        }),
      ).rejects.toThrow('Custom field with ID nonexistent not found');
    });

    it('should throw when required fields are missing', async () => {
      await expect(
        callTool('set_custom_field', { customFieldId: 'c', value: 'v' }),
      ).rejects.toThrow("set_custom_field: 'taskId' is required");
      await expect(
        callTool('set_custom_field', { taskId: 't', value: 'v' }),
      ).rejects.toThrow("set_custom_field: 'customFieldId' is required");
      await expect(
        callTool('set_custom_field', { taskId: 't', customFieldId: 'c' }),
      ).rejects.toThrow("set_custom_field: 'value' is required");
    });
  });

  describe('create_custom_column', () => {
    const existingColumns = {
      columns: [
        {
          id: 'col-1',
          projectID: '100',
          name: 'Status',
          readOnly: false,
          __typename: 'DefaultColumn',
        },
        {
          id: 'col-2',
          projectID: '100',
          name: 'Sprint Goal',
          readOnly: false,
          __typename: 'TextCustomColumn',
          activated: true,
        },
      ],
    };

    it('should create a time spent column with time reporting flags', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({
          createTimeSpentCustomColumn: {
            id: 'col-9',
            projectID: '100',
            name: 'Time Spent',
            readOnly: false,
            activated: true,
            __typename: 'TimeSpentCustomColumn',
          },
        });

      const result = await callTool('create_custom_column', {
        projectId: '100',
        name: 'Time Spent',
        columnType: 'timeSpent',
        useForTimeReporting: true,
        updateWorkRemaining: false,
      });

      const [query, variables] = getQueryCall(mockGraphqlClient.query, 1);
      expect(query).toContain('createTimeSpentCustomColumn(');
      expect(query).toContain('createTimeSpentCustomColumnInput: $input');
      expect(query).toContain('$input: CreateTimeSpentCustomColumnInput!');
      expect(variables).toEqual({
        projectID: '100',
        input: {
          name: 'Time Spent',
          readOnly: false,
          activated: true,
          useForTimeReporting: true,
          updateWorkRemaining: false,
        },
      });

      const parsed = parseToolResult<{
        success: boolean;
        column: { id: string; __typename: string };
      }>(result);
      expect(parsed.success).toBe(true);
      expect(parsed.column.id).toBe('col-9');
      expect(parsed.column.__typename).toBe('TimeSpentCustomColumn');
    });

    it('should pass readOnly and activated through', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createTextCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Notes',
        columnType: 'text',
        readOnly: true,
        activated: false,
      });

      const [query, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(query).toContain('createTextCustomColumn(');
      expect(variables.input).toEqual({
        name: 'Notes',
        readOnly: true,
        activated: false,
      });
    });

    it('should send unitName for number columns', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createNumberCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Story size',
        columnType: 'number',
        unitName: 'pts',
      });

      const [query, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(query).toContain('$input: CreateNumberCustomColumnInput!');
      expect(query).toContain('unitName');
      expect(variables.input).toMatchObject({ unitName: 'pts' });
    });

    it('should default drop-list item icons and trim names', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({
          createSingleSelectionDropListCustomColumn: { id: 'col-9' },
        });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Area',
        columnType: 'singleSelectionDropList',
        dropListItems: [
          { name: ' Frontend ' },
          { name: 'Backend', icon: 'redBox' },
        ],
      });

      const [query, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(query).toContain('$input: CreateDropListCustomColumnInput!');
      expect(variables.input).toMatchObject({
        dropListItems: [
          { name: 'Frontend', icon: 'default' },
          { name: 'Backend', icon: 'redBox' },
        ],
      });
    });

    it('should send date update flags with updateOnlyFirstTime', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createDateCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Completed on',
        columnType: 'date',
        updateOnCompleted: true,
        updateOnlyFirstTime: true,
      });

      const [, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(variables.input).toMatchObject({
        updateOnCompleted: true,
        updateOnlyFirstTime: true,
      });
    });

    it('should require updateOnlyFirstTime when date update flags are set', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Completed on',
          columnType: 'dateTime',
          updateOnCompleted: true,
        }),
      ).rejects.toThrow(
        "create_custom_column: 'updateOnlyFirstTime' is required when setting updateOnCompleted",
      );
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('should not require updateOnlyFirstTime when date flags are false', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createDateCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Due',
        columnType: 'date',
        updateOnNew: false,
      });

      const [, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(variables.input).toMatchObject({ updateOnNew: false });
    });

    it('should ignore empty values for parameters of other column types', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createTextCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Notes',
        columnType: 'text',
        unitName: '',
        useForTimeReporting: false,
        dropListItems: [],
      });

      const [, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(variables.input).toEqual({
        name: 'Notes',
        readOnly: false,
        activated: true,
      });
    });

    it('should run local checks before looking up a non-numeric projectId', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: 'Alpha',
          name: 'Notes',
          columnType: 'text',
          unitName: 'h',
        }),
      ).rejects.toThrow("'unitName' only applies to columnType");
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('should handle a null columns list in the duplicate check', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce({ columns: null })
        .mockResolvedValueOnce({ createTextCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Notes',
        columnType: 'text',
      });

      expect(mockGraphqlClient.query).toHaveBeenCalledTimes(2);
    });

    it('should only blame missing manager rights when the create itself is forbidden', async () => {
      mockGraphqlClient.query.mockRejectedValueOnce(
        new Error('GraphQL Error: Access forbidden'),
      );

      const error = await Promise.resolve(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Notes',
          columnType: 'text',
        }),
      ).catch((caught: Error) => caught);

      expect((error as Error).message).toBe('GraphQL Error: Access forbidden');
    });

    it('should reject parameters that do not apply to the column type', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Notes',
          columnType: 'text',
          unitName: 'hours',
        }),
      ).rejects.toThrow(
        "create_custom_column: 'unitName' only applies to columnType number or decimalNumber, not text",
      );
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('should require drop-list items for drop-list columns', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Area',
          columnType: 'multipleSelectionDropList',
          dropListItems: [],
        }),
      ).rejects.toThrow(
        "create_custom_column: 'dropListItems' with at least one option is required for multipleSelectionDropList",
      );
    });

    it('should reject drop-list items without a name', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Area',
          columnType: 'singleSelectionDropList',
          dropListItems: [{ name: 'Frontend' }, { name: '  ' }],
        }),
      ).rejects.toThrow(
        "create_custom_column: dropListItems[1] is missing 'name'",
      );
    });

    it('should reject an unsupported column type', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Formula',
          columnType: 'function',
        }),
      ).rejects.toThrow(
        'create_custom_column: unsupported columnType "function"',
      );
    });

    it('should reject a name that already exists in the section', async () => {
      mockGraphqlClient.query.mockResolvedValueOnce(existingColumns);

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'sprint goal',
          columnType: 'text',
        }),
      ).rejects.toThrow(
        'Column "Sprint Goal" already exists in project 100 (column ID col-2, TextCustomColumn)',
      );
      expect(mockGraphqlClient.query).toHaveBeenCalledTimes(1);
    });

    it('should not treat default columns as duplicates', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ createTextCustomColumn: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Status',
        columnType: 'text',
      });

      expect(mockGraphqlClient.query).toHaveBeenCalledTimes(2);
    });

    it('should explain the required rights on access forbidden', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockRejectedValueOnce(new Error('GraphQL Error: Access forbidden'));

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Time Spent',
          columnType: 'timeSpent',
        }),
      ).rejects.toThrow(
        'GraphQL Error: Access forbidden. Creating custom columns requires main project manager rights in project 100',
      );
    });

    it('should accept drop-list items as plain strings', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce({ created: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '100',
        name: 'Area',
        columnType: 'singleSelectionDropList',
        dropListItems: ['Frontend', { name: 'Backend', icon: 'redBox' }],
      });

      const [, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(variables.input).toMatchObject({
        dropListItems: [
          { name: 'Frontend', icon: 'default' },
          { name: 'Backend', icon: 'redBox' },
        ],
      });
    });

    it.each([
      '{"label":"Low","color":"red"}',
      '{"name":"Low","icon":"purple"}',
    ])('should reject a JSON-looking drop-list item %p', async (rawItem) => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Area',
          columnType: 'singleSelectionDropList',
          dropListItems: [rawItem],
        }),
      ).rejects.toThrow('dropListItems[0] is not a valid option');
      expect(mockGraphqlClient.query).not.toHaveBeenCalled();
    });

    it('should reject duplicate drop-list item names', async () => {
      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Area',
          columnType: 'singleSelectionDropList',
          dropListItems: ['Frontend', 'frontend'],
        }),
      ).rejects.toThrow(
        'create_custom_column: dropListItems contains "frontend" more than once',
      );
    });

    const assignable = (
      users: Array<[string, string]>,
      groups: Array<[string, string]> = [],
    ) => ({
      projectAvailableUsersAndGroups: [
        ...users.map(([id, name]) => ({ __typename: 'NormalUser', id, name })),
        ...groups.map(([id, name]) => ({ __typename: 'UserGroup', id, name })),
      ],
    });

    it('should resolve auto-assign users and groups by ID or name', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce(
          assignable(
            [
              ['13', 'UserA'],
              ['14', 'UserB'],
            ],
            [
              ['50', 'QA team'],
              ['60', 'Everyone'],
            ],
          ),
        )
        .mockResolvedValueOnce({ created: { id: 'col-9' } });

      await callTool('create_custom_column', {
        projectId: '102',
        name: 'Triage',
        columnType: 'singleSelectionDropList',
        dropListItems: [
          {
            name: 'Needs QA',
            autoAssignToUsers: ['userb', '13'],
            autoAssignToUserGroups: ['QA Team', '60'],
          },
          'Done',
        ],
      });

      const [assignableQuery, assignableVariables] = getQueryCall(
        mockGraphqlClient.query,
        1,
      );
      expect(assignableQuery).toContain('projectAvailableUsersAndGroups');
      expect(assignableVariables).toEqual({ id: '102' });
      const [, variables] = getLastQueryCall(mockGraphqlClient.query);
      expect(variables).toEqual({
        projectID: '102',
        input: {
          name: 'Triage',
          readOnly: false,
          activated: true,
          dropListItems: [
            {
              name: 'Needs QA',
              icon: 'default',
              autoAssignToUsers: ['14', '13'],
              autoAssignToUserGroups: ['50', '60'],
            },
            { name: 'Done', icon: 'default' },
          ],
        },
      });
    });

    it('should not resolve a user name to a group', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce(assignable([['13', 'UserA']], [['50', 'Ops']]));

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Triage',
          columnType: 'singleSelectionDropList',
          dropListItems: [{ name: 'Mine', autoAssignToUsers: ['Ops'] }],
        }),
      ).rejects.toThrow(
        'create_custom_column: unknown user "Ops" — see list_project_users. Available: UserA (13)',
      );
    });

    it('should say when the list of available users is truncated', async () => {
      const many = Array.from({ length: 25 }, (_, index): [string, string] => [
        String(index + 1),
        `User${index + 1}`,
      ]);
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce(assignable(many));

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Triage',
          columnType: 'singleSelectionDropList',
          dropListItems: [{ name: 'Mine', autoAssignToUsers: ['Bob'] }],
        }),
      ).rejects.toThrow('Available (first 20 of 25): User1 (1)');
    });

    it('should reject auto-assign names that match more than one user', async () => {
      mockGraphqlClient.query
        .mockResolvedValueOnce(existingColumns)
        .mockResolvedValueOnce(
          assignable([
            ['13', 'Alex'],
            ['14', 'alex'],
          ]),
        );

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Triage',
          columnType: 'singleSelectionDropList',
          dropListItems: [{ name: 'Mine', autoAssignToUsers: ['Alex'] }],
        }),
      ).rejects.toThrow(
        'create_custom_column: user name "Alex" is ambiguous: Alex (13), alex (14). Pass the ID instead',
      );
    });

    it('should check the name before resolving auto-assignments', async () => {
      mockGraphqlClient.query.mockResolvedValueOnce(existingColumns);

      await expect(
        callTool('create_custom_column', {
          projectId: '100',
          name: 'Sprint Goal',
          columnType: 'singleSelectionDropList',
          dropListItems: [{ name: 'Mine', autoAssignToUsers: ['UserA'] }],
        }),
      ).rejects.toThrow('Column "Sprint Goal" already exists');
      expect(mockGraphqlClient.query).toHaveBeenCalledTimes(1);
    });

    it('should explain section IDs when given a project name', async () => {
      mockGraphqlClient.query.mockResolvedValueOnce({
        userProjects: [
          {
            id: '100',
            name: 'Alpha',
            backlog: { id: '101' },
            qa: { id: '102' },
          },
        ],
      });

      await expect(
        callTool('create_custom_column', {
          projectId: 'alpha',
          name: 'Notes',
          columnType: 'text',
        }),
      ).rejects.toThrow(
        'Project "Alpha" has planning ID 100, backlogID 101 and qaID 102',
      );
      expect(mockGraphqlClient.query).toHaveBeenCalledTimes(1);
    });

    it('should point to list_projects for an unknown non-numeric projectId', async () => {
      mockGraphqlClient.query.mockResolvedValueOnce({ userProjects: [] });

      await expect(
        callTool('create_custom_column', {
          projectId: 'my project',
          name: 'Notes',
          columnType: 'text',
        }),
      ).rejects.toThrow(
        'create_custom_column: \'projectId\' "my project" is not a project ID. Call list_projects',
      );
    });

    it('should explain an invalid project ID from the API', async () => {
      mockGraphqlClient.query.mockRejectedValueOnce(
        new Error('GraphQL Error: Invalid project ID'),
      );

      await expect(
        callTool('create_custom_column', {
          projectId: '999',
          name: 'Notes',
          columnType: 'text',
        }),
      ).rejects.toThrow(
        'GraphQL Error: Invalid project ID. Use a planning project ID, backlogID or qaID from list_projects',
      );
    });

    it('should throw when required fields are missing', async () => {
      await expect(
        callTool('create_custom_column', { projectId: '100', name: 'X' }),
      ).rejects.toThrow("create_custom_column: 'columnType' is required");
    });
  });

  describe('get_workflows', () => {
    it('should return workflows with statuses', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        workflows: [
          {
            __typename: 'StatusWorkflow',
            id: 'wf-1',
            projectID: 'p-1',
            name: 'Dev Pipeline',
            canSetWorkflowOnItems: true,
            showInQA: false,
            showInPlanning: true,
            statuses: [
              {
                id: 'ws-1',
                workflowID: 'wf-1',
                name: 'To Do',
                connectedStatuses: [
                  { connectedTo: { id: 'ws-2', name: 'In Progress' } },
                ],
              },
              {
                id: 'ws-2',
                workflowID: 'wf-1',
                name: 'In Progress',
                connectedStatuses: [
                  { connectedTo: { id: 'ws-3', name: 'Done' } },
                ],
              },
            ],
          },
        ],
      });

      const result = await callTool('get_workflows', { projectId: 'p-1' });
      const data = parseToolResult<{
        count: number;
        workflows: {
          name: string;
          type: string;
          statuses: { canTransitionTo: unknown[] }[];
        }[];
      }>(result);

      expect(data.count).toBe(1);
      expect(data.workflows[0].name).toBe('Dev Pipeline');
      expect(data.workflows[0].type).toBe('StatusWorkflow');
      expect(data.workflows[0].statuses).toHaveLength(2);
      expect(data.workflows[0].statuses[0].canTransitionTo).toHaveLength(1);
    });

    it('should report PipelineWorkflow from __typename', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        workflows: [
          {
            __typename: 'PipelineWorkflow',
            id: 'wf-2',
            projectID: 'p-1',
            name: 'Simple Flow',
            canSetWorkflowOnItems: false,
          },
        ],
      });

      const result = await callTool('get_workflows', { projectId: 'p-1' });
      const data = parseToolResult<{
        workflows: { type: string }[];
      }>(result);

      expect(data.workflows[0].type).toBe('PipelineWorkflow');
    });

    it('does not mistake a status workflow with no statuses for a pipeline', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        workflows: [
          {
            __typename: 'StatusWorkflow',
            id: 'wf-3',
            projectID: 'p-1',
            name: 'Empty Flow',
            canSetWorkflowOnItems: true,
            statuses: [],
          },
        ],
      });

      const result = await callTool('get_workflows', { projectId: 'p-1' });
      const data = parseToolResult<{
        workflows: { type: string }[];
      }>(result);

      expect(data.workflows[0].type).toBe('StatusWorkflow');
    });

    it('should throw when projectId is missing', async () => {
      await expect(callTool('get_workflows', {})).rejects.toThrow(
        "get_workflows: 'projectId' is required",
      );
    });
  });
});
