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
  CREATE_CUSTOM_COLUMN_MUTATIONS,
  GET_COLUMN_NAMES_QUERY,
  GET_ASSIGNABLE_USERS_AND_GROUPS_QUERY,
  LIST_PROJECTS_QUERY,
} from '../graphql';

const CUSTOM_COLUMN_TYPES = Object.keys(CREATE_CUSTOM_COLUMN_MUTATIONS);

const DROP_LIST_COLUMN_TYPES = [
  'singleSelectionDropList',
  'multipleSelectionDropList',
];

const DATE_UPDATE_FLAGS = [
  'updateOnNew',
  'updateOnNotDone',
  'updateOnInProgress',
  'updateOnBlocked',
  'updateOnToBeDeleted',
  'updateOnCompleted',
  'updateOnCommitted',
];

const TYPE_SPECIFIC_PARAMETERS: Record<string, string[]> = {
  unitName: ['number', 'decimalNumber'],
  ...Object.fromEntries(
    [...DATE_UPDATE_FLAGS, 'updateOnlyFirstTime'].map((flag) => [
      flag,
      ['date', 'dateTime'],
    ]),
  ),
  useForTimeReporting: ['timeSpent'],
  updateWorkRemaining: ['timeSpent'],
  dropListItems: DROP_LIST_COLUMN_TYPES,
};

const COLUMN_TYPE_ALIASES: Record<string, string> = {
  string: 'text',
  singleLineText: 'text',
  url: 'hyperlink',
  link: 'hyperlink',
  multiline: 'multilineText',
  longText: 'multilineText',
  richText: 'multilineText',
  textArea: 'multilineText',
  users: 'user',
  resource: 'user',
  resources: 'user',
  person: 'user',
  people: 'user',
  integer: 'number',
  int: 'number',
  wholeNumber: 'number',
  decimal: 'decimalNumber',
  float: 'decimalNumber',
  double: 'decimalNumber',
  dateWithTime: 'dateTime',
  dateAndTime: 'dateTime',
  timestamp: 'dateTime',
  time: 'timeSpent',
  accumulatedTime: 'timeSpent',
  timeReporting: 'timeSpent',
  dropList: 'singleSelectionDropList',
  dropdown: 'singleSelectionDropList',
  select: 'singleSelectionDropList',
  singleSelect: 'singleSelectionDropList',
  singleSelection: 'singleSelectionDropList',
  list: 'singleSelectionDropList',
  multiDropList: 'multipleSelectionDropList',
  multiSelectionDropList: 'multipleSelectionDropList',
  multiSelect: 'multipleSelectionDropList',
  multipleSelection: 'multipleSelectionDropList',
  multiDropdown: 'multipleSelectionDropList',
  tags: 'multipleSelectionDropList',
  ...Object.fromEntries(
    Object.keys(CREATE_CUSTOM_COLUMN_MUTATIONS).map((columnType) => [
      `${columnType}CustomColumn`,
      columnType,
    ]),
  ),
};

const DROP_LIST_ITEM_ICONS = [
  'default',
  'whiteBox',
  'greenBox',
  'yellowBox',
  'redBox',
  'blueBox',
  'magentaBox',
  'orangeBox',
  'check',
  'redDot',
  'blueFace',
  'greyFace',
  'orangeFace',
  'goldFace',
  'locked',
  'unlocked',
  'reOpenBug',
  'newBug',
  'assignedBug',
  'fixedBug',
  'verifiedBug',
  'closedBug',
  'group',
  'greyGroup',
  'lightGreyGroup',
  'greenCircle',
  'yellowCircle',
  'redCircle',
  'blueCircle',
  'magentaCircle',
  'orangeCircle',
  'yesBox',
  'noBox',
  'questionBox',
  'project',
  'deletedUser',
  'workflow',
  'progress',
  'step',
  'pipeline',
  'report',
  'veryHighPriorityBox',
  'highPriorityBox',
  'mediumPriorityBox',
  'lowPriorityBox',
  'veryLowPriorityBox',
  'disabledBox',
  'plus',
  'noIcon',
  'warningTriangleRed',
  'warningTriangleYellow',
  'exclamationMark',
  'information',
  'pause',
  'stop',
];

interface NamedId {
  id: string;
  name: string;
}

interface DropListItemArgs {
  name: string;
  icon?: string;
  autoAssignToUsers?: string[];
  autoAssignToUserGroups?: string[];
}

function isMeaningful(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  );
}

function parseDropListItems(
  rawItems: unknown,
  columnType: string,
): DropListItemArgs[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error(
      `create_custom_column: 'dropListItems' with at least one option is required for ${columnType}, e.g. ["Frontend","Backend"]`,
    );
  }

  const items = rawItems.map((rawItem: unknown, index) => {
    const item = (
      typeof rawItem === 'string' ? { name: rawItem } : rawItem
    ) as Partial<DropListItemArgs> | null;
    const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!itemName) {
      throw new Error(
        `create_custom_column: dropListItems[${index}] is missing 'name'`,
      );
    }
    return { ...item, name: itemName };
  });

  const duplicate = items.find(
    (item, index) =>
      items.findIndex(
        (other) => other.name.toLowerCase() === item.name.toLowerCase(),
      ) !== index,
  );
  if (duplicate) {
    throw new Error(
      `create_custom_column: dropListItems contains "${duplicate.name}" more than once`,
    );
  }
  return items;
}

function resolveNamedId(
  value: string,
  candidates: NamedId[],
  kind: string,
  listTool?: string,
): string {
  const trimmed = String(value).trim();
  const idMatch = candidates.find((candidate) => candidate.id === trimmed);
  if (idMatch) return idMatch.id;

  const nameMatches = candidates.filter(
    (candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (nameMatches.length > 1) {
    throw new Error(
      `create_custom_column: ${kind} name "${trimmed}" is ambiguous: ${nameMatches.map((candidate) => `${candidate.name} (${candidate.id})`).join(', ')}. Pass the ID instead`,
    );
  }
  if (nameMatches.length === 1) return nameMatches[0].id;

  const shown = candidates
    .slice(0, 20)
    .map((candidate) => `${candidate.name} (${candidate.id})`)
    .join(', ');
  const truncated =
    candidates.length > 20 ? ` (first 20 of ${candidates.length})` : '';
  throw new Error(
    `create_custom_column: unknown ${kind} "${trimmed}"${listTool ? ` — see ${listTool}` : ''}. Available${truncated}: ${shown || 'none'}`,
  );
}

function explainCreateError(
  error: unknown,
  projectId: string,
  fromMutation: boolean,
): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (fromMutation && /access forbidden/i.test(message)) {
    return new Error(
      `${message}. Creating custom columns requires main project manager rights in project ${projectId}`,
      { cause: error },
    );
  }
  if (/invalid project id/i.test(message)) {
    return new Error(
      `${message}. Use a planning project ID, backlogID or qaID from list_projects`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * Task Custom Fields & Workflows Tools
 *
 * Handles custom fields and workflows:
 * - get_custom_columns: Get custom column definitions
 * - create_custom_column: Create a custom column in a project section
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

    // create_custom_column
    tools.set('create_custom_column', {
      definition: {
        name: 'create_custom_column',
        description:
          'Create a custom column in a project section. For vague requests, read_skill skillName="custom-fields" first. SECTION: call list_projects, then pass one ID per call: planning/sprints/schedule = project id, backlog/product backlog = backlogID, QA/bugs = qaID. "Everywhere"/"all sections" = call 3 times with identical settings. Ask if the section is unclear. TYPE: free text = text; notes/long text = multilineText; link/URL = hyperlink; people/owner/reviewer = user; whole number/points = number; money/decimal = decimalNumber (+unitName); date = date; date and time = dateTime; log hours = timeSpent; pick one/dropdown/status = singleSelectionDropList; pick several/tags/multi-select = multipleSelectionDropList. Only the listed parameters exist — others are silently ignored: hidden → activated:false, read-only → readOnly:true, options/choices → dropListItems. Requires main project manager rights. Names are unique per section (case-insensitive). Function/formula columns cannot be created; columns cannot be renamed or deleted. Examples: {"projectId":"123","name":"Time Spent","columnType":"timeSpent","useForTimeReporting":true} · {"projectId":"124","name":"Tags","columnType":"multipleSelectionDropList","dropListItems":["urgent","customer"]} · {"projectId":"123","name":"Risk","columnType":"singleSelectionDropList","dropListItems":[{"name":"Low","icon":"greenCircle"},{"name":"High","icon":"redCircle"}]}',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description:
                'One section ID from list_projects: planning project id, backlogID or qaID (QA/bugs). Not a project name',
            },
            name: {
              type: 'string',
              description:
                'The column name as the user said it, unique within the section (case-insensitive)',
            },
            columnType: {
              type: 'string',
              enum: CUSTOM_COLUMN_TYPES,
              enumAliases: COLUMN_TYPE_ALIASES,
              description:
                'The column type. number = integer, decimalNumber = float, timeSpent = accumulated time spent, user = users/groups',
            },
            activated: {
              type: 'boolean',
              description:
                'Visible in the project (default: true). Use false when the user wants the column hidden',
            },
            readOnly: {
              type: 'boolean',
              description:
                'Read-only for project members (default: false). Use true for "read-only"/"locked"',
            },
            unitName: {
              type: 'string',
              description:
                'number/decimalNumber only: unit shown with the value, e.g. "EUR", "pts". Use the same unit in every section so it stays one column',
            },
            updateOnNew: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when an item is created',
            },
            updateOnNotDone: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when status becomes Not done',
            },
            updateOnInProgress: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when status becomes In progress',
            },
            updateOnBlocked: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when status becomes Blocked',
            },
            updateOnToBeDeleted: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when status becomes To be deleted',
            },
            updateOnCompleted: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when status becomes Completed',
            },
            updateOnCommitted: {
              type: 'boolean',
              description:
                'date/dateTime only: set the date when an item is committed to the planning section',
            },
            updateOnlyFirstTime: {
              type: 'boolean',
              description:
                'date/dateTime only: REQUIRED whenever any updateOn* flag is set. true = only the first time ("when first completed"), false = every time ("each time it is completed")',
            },
            useForTimeReporting: {
              type: 'boolean',
              description:
                'timeSpent only: make this the column people log hours in from their to-do list. Set it only when the user asks for time logging/reporting: a project has one such column for planning+backlog and one for QA, and this replaces the current one — tell the user',
            },
            updateWorkRemaining: {
              type: 'boolean',
              description:
                'timeSpent only: automatically reduce work remaining when time spent is reported',
            },
            dropListItems: {
              type: 'array',
              description:
                'Drop lists only (required): the options in order. Plain labels ["Low","High"] are enough; use objects only for icon or auto-assignment. Object keys are exactly name, icon, autoAssignToUsers, autoAssignToUserGroups (not label/color)',
              items: {
                anyOf: [
                  {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'The option label',
                      },
                      icon: {
                        type: 'string',
                        enum: DROP_LIST_ITEM_ICONS,
                        enumAliases: { none: 'noIcon' },
                        description:
                          'Optional icon. Colours: greenCircle/greenBox, yellowCircle/yellowBox, redCircle/redBox, blueCircle/blueBox, orangeCircle/orangeBox, magentaCircle/magentaBox (purple/pink), whiteBox. Also check, noBox, yesBox, questionBox, warningTriangleRed, warningTriangleYellow, information, locked, highPriorityBox…',
                      },
                      autoAssignToUsers: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'singleSelectionDropList only: users (IDs or names from list_project_users) auto-assigned when this option is chosen. Multi-select columns store it but never auto-assign — tell the user',
                      },
                      autoAssignToUserGroups: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'singleSelectionDropList only: user groups (IDs or names) auto-assigned when this option is chosen',
                      },
                    },
                    required: ['name'],
                  },
                  { type: 'string', description: 'The option label' },
                ],
              },
            },
          },
          required: ['projectId', 'name', 'columnType'],
        },
      },
      handler: (args, authToken) => this.createCustomColumn(args, authToken),
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
          'Set a custom field value on a task. Get column IDs from get_custom_columns first. For drop lists, pass the option ID (not the display label). Pass empty string to clear a value. For Multiline Text columns, the value is sanitized HTML — call read_skill with skillName="comment-html-format" before composing it.',
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
                'The value to set. For numbers use numeric string, for dates use ISO format (YYYY-MM-DD), for drop lists use the option ID, for user fields use comma-separated user IDs. For Multiline Text columns, use sanitized HTML — see the comment-html-format skill.',
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

  private async createCustomColumn(
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpToolResult> {
    validateRequired(
      args,
      ['projectId', 'name', 'columnType'],
      'create_custom_column',
    );
    const projectId = String(args.projectId).trim();
    const name = String(args.name).trim();
    const columnType = String(args.columnType);

    const mutation = CREATE_CUSTOM_COLUMN_MUTATIONS[columnType];
    if (!mutation) {
      throw new Error(
        `create_custom_column: unsupported columnType "${columnType}". Use one of: ${CUSTOM_COLUMN_TYPES.join(', ')} (Function columns cannot be created)`,
      );
    }
    if (!name) {
      throw new Error("create_custom_column: 'name' must not be empty");
    }

    const input: Record<string, unknown> = {
      name,
      readOnly: (args.readOnly as boolean | undefined) ?? false,
      activated: (args.activated as boolean | undefined) ?? true,
    };
    for (const [parameter, columnTypes] of Object.entries(
      TYPE_SPECIFIC_PARAMETERS,
    )) {
      const value = args[parameter];
      if (value === undefined) continue;
      if (!columnTypes.includes(columnType)) {
        if (isMeaningful(value)) {
          throw new Error(
            `create_custom_column: '${parameter}' only applies to columnType ${columnTypes.join(' or ')}, not ${columnType}`,
          );
        }
        continue;
      }
      if (parameter !== 'dropListItems') input[parameter] = value;
    }

    const dateFlagsSet = DATE_UPDATE_FLAGS.filter(
      (flag) => args[flag] === true,
    );
    if (dateFlagsSet.length > 0 && args.updateOnlyFirstTime === undefined) {
      throw new Error(
        `create_custom_column: 'updateOnlyFirstTime' is required when setting ${dateFlagsSet.join(', ')}`,
      );
    }

    const dropListItems = DROP_LIST_COLUMN_TYPES.includes(columnType)
      ? parseDropListItems(args.dropListItems, columnType)
      : undefined;

    if (!/^\d+$/.test(projectId)) {
      await this.throwProjectIdHint(projectId, authToken);
    }

    try {
      await this.assertColumnNameAvailable(projectId, name, authToken);
      if (dropListItems) {
        input.dropListItems = await this.resolveDropListItems(
          dropListItems,
          projectId,
          authToken,
        );
      }
    } catch (error) {
      throw explainCreateError(error, projectId, false);
    }

    let result: Record<string, Record<string, unknown>>;
    try {
      result = await this.graphqlClient.query<
        Record<string, Record<string, unknown>>
      >(mutation, { projectID: projectId, input }, authToken);
    } catch (error) {
      throw explainCreateError(error, projectId, true);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            column: Object.values(result)[0],
          }),
        },
      ],
    };
  }

  private async assertColumnNameAvailable(
    projectId: string,
    name: string,
    authToken: string,
  ): Promise<void> {
    const { columns } = await this.graphqlClient.query<{
      columns: Array<{
        id: string;
        name: string;
        __typename: string;
      } | null> | null;
    }>(GET_COLUMN_NAMES_QUERY, { id: projectId }, authToken);
    const existingColumn = (columns ?? []).find(
      (column) =>
        column !== null &&
        column.__typename !== 'DefaultColumn' &&
        column.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingColumn) {
      throw new Error(
        `Column "${existingColumn.name}" already exists in project ${projectId} (column ID ${existingColumn.id}, ${existingColumn.__typename})`,
      );
    }
  }

  private async throwProjectIdHint(
    projectId: string,
    authToken: string,
  ): Promise<never> {
    const { userProjects } = await this.graphqlClient.query<{
      userProjects: Array<{
        id: string;
        name: string;
        backlog: { id: string };
        qa: { id: string };
      }>;
    }>(LIST_PROJECTS_QUERY, {}, authToken);
    const project = userProjects.find(
      (candidate) => candidate.name.toLowerCase() === projectId.toLowerCase(),
    );
    if (project) {
      throw new Error(
        `create_custom_column: 'projectId' must be an ID, not a name. Project "${project.name}" has planning ID ${project.id}, backlogID ${project.backlog.id} and qaID ${project.qa.id} — call again with the section's ID`,
      );
    }
    throw new Error(
      `create_custom_column: 'projectId' "${projectId}" is not a project ID. Call list_projects to get the planning project ID, backlogID or qaID`,
    );
  }

  private async resolveDropListItems(
    items: DropListItemArgs[],
    projectId: string,
    authToken: string,
  ): Promise<Array<Record<string, unknown>>> {
    const needsAssignees = items.some(
      (item) =>
        item.autoAssignToUsers?.length || item.autoAssignToUserGroups?.length,
    );
    const { users, groups } = needsAssignees
      ? await this.getAssignableUsersAndGroups(projectId, authToken)
      : { users: [], groups: [] };

    return items.map((item) => {
      const dropListItem: Record<string, unknown> = {
        name: item.name,
        icon: item.icon ?? 'default',
      };
      if (item.autoAssignToUsers?.length) {
        dropListItem.autoAssignToUsers = item.autoAssignToUsers.map((user) =>
          resolveNamedId(user, users, 'user', 'list_project_users'),
        );
      }
      if (item.autoAssignToUserGroups?.length) {
        dropListItem.autoAssignToUserGroups = item.autoAssignToUserGroups.map(
          (group) => resolveNamedId(group, groups, 'user group'),
        );
      }
      return dropListItem;
    });
  }

  private async getAssignableUsersAndGroups(
    projectId: string,
    authToken: string,
  ): Promise<{ users: NamedId[]; groups: NamedId[] }> {
    const { projectAvailableUsersAndGroups } = await this.graphqlClient.query<{
      projectAvailableUsersAndGroups: Array<
        (NamedId & { __typename: string }) | null
      >;
    }>(GET_ASSIGNABLE_USERS_AND_GROUPS_QUERY, { id: projectId }, authToken);
    const candidates = projectAvailableUsersAndGroups.filter(
      (candidate): candidate is NamedId & { __typename: string } =>
        candidate !== null,
    );
    return {
      users: candidates.filter(
        (candidate) => candidate.__typename !== 'UserGroup',
      ),
      groups: candidates.filter(
        (candidate) => candidate.__typename === 'UserGroup',
      ),
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
        __typename: string;
      }>;
    }>(GET_WORKFLOWS_QUERY, { id: projectId }, authToken);

    // Format workflows for readability
    const workflows = result.workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      type: workflow.__typename,
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
