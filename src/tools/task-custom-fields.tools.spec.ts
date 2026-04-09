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
      expect(names).toContain('get_workflows');
      expect(names).toHaveLength(4);
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

  describe('get_workflows', () => {
    it('should return workflows with statuses', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        workflows: [
          {
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

    it('should identify PipelineWorkflow when statuses are absent', async () => {
      mockGraphqlClient.query.mockResolvedValue({
        workflows: [
          {
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

    it('should throw when projectId is missing', async () => {
      await expect(callTool('get_workflows', {})).rejects.toThrow(
        "get_workflows: 'projectId' is required",
      );
    });
  });
});
