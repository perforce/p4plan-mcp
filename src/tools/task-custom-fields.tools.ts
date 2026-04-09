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
  GET_WORKFLOWS_QUERY,
  GET_ITEM_PROJECT_QUERY,
  GET_COLUMN_TYPES_QUERY,
  GET_COLUMNS_QUERY,
  GET_ACTIVE_COLUMNS_QUERY,
  GET_CUSTOM_FIELDS_QUERY,
  GET_CUSTOM_FIELDS_SET_QUERY,
  SET_CUSTOM_FIELD_MUTATIONS,
} from '../graphql';

/**
 * Task Custom Fields & Workflows Tools
 *
 * Handles custom fields and workflows:
 * - get_custom_columns: Get custom column definitions
 * - get_custom_fields: Get custom field values on a task
 * - set_custom_field: Set a custom field value
 * - get_workflows: Get workflow definitions
 */
@Injectable()
export class TaskCustomFieldsTools extends TaskToolsBase {
  constructor(graphqlClient: GraphQLClientService) {
    super(graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // get_custom_columns
    tools.set('get_custom_columns', {
      definition: {
        name: 'get_custom_columns',
        description:
          'Get custom column definitions for a project. Returns column IDs, names, types, and drop-list options. Call this before set_custom_field to discover available column IDs and valid option values.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID to get custom columns from',
            },
            activeOnly: {
              type: 'boolean',
              description:
                'If true, only return activated custom columns (default: false)',
            },
          },
          required: ['projectId'],
        },
      },
      handler: (args, authToken) => this.getCustomColumns(args, authToken),
    });

    // get_custom_fields
    tools.set('get_custom_fields', {
      definition: {
        name: 'get_custom_fields',
        description:
          'Get custom field values set on a task. Returns all custom fields with their current values.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to get custom field values from',
            },
            onlySet: {
              type: 'boolean',
              description:
                'If true, only return custom fields that have values set (default: false)',
            },
          },
          required: ['taskId'],
        },
      },
      handler: (args, authToken) => this.getCustomFields(args, authToken),
    });

    // set_custom_field
    tools.set('set_custom_field', {
      definition: {
        name: 'set_custom_field',
        description:
          'Set a custom field value on a task. Get column IDs from get_custom_columns first. For drop lists, pass the option ID (not the display label). Pass empty string to clear a value.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'The task ID to set the custom field on',
            },
            customFieldId: {
              type: 'string',
              description:
                'The custom field/column ID (get IDs from get_custom_columns)',
            },
            value: {
              type: 'string',
              description:
                'The value to set. For numbers use numeric string, for dates use ISO format (YYYY-MM-DD), for drop lists use the option ID, for user fields use comma-separated user IDs',
            },
          },
          required: ['taskId', 'customFieldId', 'value'],
        },
      },
      handler: (args, authToken) => this.setCustomField(args, authToken),
    });

    // get_workflows
    tools.set('get_workflows', {
      definition: {
        name: 'get_workflows',
        description:
          'Get all workflows defined in a project, including their statuses. Use this to find workflow status IDs for setting workflowStatusId on tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID to get workflows from',
            },
          },
          required: ['projectId'],
        },
      },
      handler: (args, authToken) => this.getWorkflows(args, authToken),
    });

    return tools;
  }

  private async getCustomColumns(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'get_custom_columns');
    const projectId = args.projectId as string;
    const activeOnly = args.activeOnly as boolean | undefined;

    const query = activeOnly ? GET_ACTIVE_COLUMNS_QUERY : GET_COLUMNS_QUERY;

    const result = await this.graphqlClient.query<{
      columns?: Array<{
        id: string;
        projectID: string;
        name: string;
        readOnly: boolean;
        __typename: string;
        activated?: boolean;
        items?: Array<{ id: string; name: string }>;
      }>;
      activeColumns?: Array<{
        id: string;
        projectID: string;
        name: string;
        readOnly: boolean;
        __typename: string;
        activated?: boolean;
        items?: Array<{ id: string; name: string }>;
      }>;
    }>(query, { id: projectId }, authToken);

    const columns = result.columns || result.activeColumns || [];

    // Filter to only custom columns (exclude DefaultColumn)
    const customColumns = columns.filter(
      (column) => column.__typename !== 'DefaultColumn',
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            projectId,
            activeOnly: activeOnly || false,
            count: customColumns.length,
            columns: customColumns,
          }),
        },
      ],
    };
  }

  private async getCustomFields(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['taskId'], 'get_custom_fields');
    const taskId = args.taskId as string;
    const onlySet = args.onlySet as boolean | undefined;

    const query = onlySet
      ? GET_CUSTOM_FIELDS_SET_QUERY
      : GET_CUSTOM_FIELDS_QUERY;

    const result = await this.graphqlClient.query<{
      customFields?: Array<Record<string, unknown>>;
      customFieldsSet?: Array<Record<string, unknown>>;
    }>(query, { id: taskId }, authToken);

    const fields = result.customFields || result.customFieldsSet || [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId,
            onlySet: onlySet || false,
            count: fields.length,
            fields,
          }),
        },
      ],
    };
  }

  private async setCustomField(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(
      args,
      ['taskId', 'customFieldId', 'value'],
      'set_custom_field',
    );
    const taskId = args.taskId as string;
    const customFieldId = args.customFieldId as string;
    const value = args.value as string;

    // First, get the column type to determine which mutation to use
    // We need to get the task's project first, then query the column
    const taskResult = await this.graphqlClient.query<{
      item: { id: string; projectID: string };
    }>(GET_ITEM_PROJECT_QUERY, { id: taskId }, authToken);

    const projectId = taskResult.item.projectID;

    // Get the column definition to determine its type
    const columnsResult = await this.graphqlClient.query<{
      columns: Array<{ id: string; __typename: string }>;
    }>(GET_COLUMN_TYPES_QUERY, { id: projectId }, authToken);

    const column = columnsResult.columns.find(
      (columnResult) => columnResult.id === customFieldId,
    );
    if (!column) {
      throw new Error(
        `Custom field with ID ${customFieldId} not found in project ${projectId}`,
      );
    }

    // Determine the mutation based on column type
    const mutation = SET_CUSTOM_FIELD_MUTATIONS[column.__typename];
    if (!mutation) {
      throw new Error(`Unsupported custom field type: ${column.__typename}`);
    }

    // Build variables with type-appropriate value coercion
    let variables: Record<string, unknown>;

    switch (column.__typename) {
      case 'NumberCustomColumn':
        variables = {
          taskID: taskId,
          customFieldID: customFieldId,
          value: parseInt(value, 10),
        };
        break;

      case 'DecimalNumberCustomColumn':
      case 'TimeSpentCustomColumn':
        variables = {
          taskID: taskId,
          customFieldID: customFieldId,
          value: parseFloat(value),
        };
        break;

      case 'MultipleSelectionDropListCustomColumn': {
        const ids = value.split(',').map((id) => id.trim());
        variables = {
          taskID: taskId,
          customFieldID: customFieldId,
          value: ids,
        };
        break;
      }

      case 'UserCustomColumn': {
        const userIds = value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        variables = {
          taskID: taskId,
          customFieldID: customFieldId,
          usersAndGroups: { users: userIds, groups: [] },
        };
        break;
      }

      default:
        // String-like types: Text, MultilineText, Hyperlink, Date, DateTime,
        // SingleSelectionDropList — all pass value as-is
        variables = { taskID: taskId, customFieldID: customFieldId, value };
        break;
    }

    await this.graphqlClient.query(mutation, variables, authToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            taskId,
            customFieldId,
            columnType: column.__typename,
            value,
          }),
        },
      ],
    };
  }

  private async getWorkflows(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(args, ['projectId'], 'get_workflows');
    const projectId = args.projectId as string;

    const result = await this.graphqlClient.query<{
      workflows: Array<{
        id: string;
        projectID: string;
        name: string;
        icon?: string;
        canSetWorkflowOnItems: boolean;
        hideItemStatus?: boolean;
        showInQA?: boolean;
        showInPlanning?: boolean;
        statuses?: Array<{
          id: string;
          workflowID: string;
          name: string;
          icon?: string;
          connectedStatuses?: Array<{
            connectedTo: { id: string; name: string };
          }>;
        }>;
        __typename?: string;
      }>;
    }>(GET_WORKFLOWS_QUERY, { id: projectId }, authToken);

    // Format workflows for readability
    const workflows = result.workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      type: workflow.statuses ? 'StatusWorkflow' : 'PipelineWorkflow',
      canSetWorkflowOnItems: workflow.canSetWorkflowOnItems,
      showInQA: workflow.showInQA,
      showInPlanning: workflow.showInPlanning,
      statuses: workflow.statuses?.map((status) => ({
        id: status.id,
        name: status.name,
        icon: status.icon,
        canTransitionTo: status.connectedStatuses?.map((connectedStatus) => ({
          id: connectedStatus.connectedTo.id,
          name: connectedStatus.connectedTo.name,
        })),
      })),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            projectId,
            count: workflows.length,
            workflows,
          }),
        },
      ],
    };
  }
}
