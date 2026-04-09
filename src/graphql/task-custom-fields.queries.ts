// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries for Custom Fields and Workflows
 */

export const GET_WORKFLOWS_QUERY = /* GraphQL */ `
  query GetWorkflows($id: ID!) {
    workflows(id: $id) {
      id
      projectID
      name
      icon
      canSetWorkflowOnItems
      ... on StatusWorkflow {
        hideItemStatus
        showInQA
        showInPlanning
        statuses {
          id
          workflowID
          name
          icon
          connectedStatuses {
            connectedTo {
              id
              name
            }
          }
        }
      }
      ... on PipelineWorkflow {
        __typename
      }
    }
  }
`;

export const GET_ITEM_PROJECT_QUERY = /* GraphQL */ `
  query GetItemProject($id: ID!) {
    item(id: $id) {
      id
      projectID
    }
  }
`;

export const GET_COLUMN_TYPES_QUERY = /* GraphQL */ `
  query GetColumnTypes($id: ID!) {
    columns(id: $id) {
      id
      __typename
    }
  }
`;

// -- Columns (shared fragment) ------------------------------------------------

const COLUMN_FIELDS_FRAGMENT = /* GraphQL */ `
  fragment ColumnFields on Column {
    id
    projectID
    name
    readOnly
    __typename
    ... on CustomColumn {
      activated
    }
    ... on SingleSelectionDropListCustomColumn {
      items {
        id
        name
      }
    }
    ... on MultipleSelectionDropListCustomColumn {
      items {
        id
        name
      }
    }
  }
`;

export const GET_COLUMNS_QUERY = /* GraphQL */ `
  ${COLUMN_FIELDS_FRAGMENT}
  query GetColumns($id: ID!) {
    columns(id: $id) {
      ...ColumnFields
    }
  }
`;

export const GET_ACTIVE_COLUMNS_QUERY = /* GraphQL */ `
  ${COLUMN_FIELDS_FRAGMENT}
  query GetActiveColumns($id: ID!) {
    activeColumns(id: $id) {
      ...ColumnFields
    }
  }
`;

// -- Custom Fields (shared fragment) ------------------------------------------

const CUSTOM_FIELD_FIELDS_FRAGMENT = /* GraphQL */ `
  fragment CustomFieldFields on CustomField {
    id
    taskID
    __typename
    ... on TextCustomField {
      value
    }
    ... on MultilineTextCustomField {
      value
    }
    ... on HyperlinkCustomField {
      value
    }
    ... on NumberCustomField {
      intValue
    }
    ... on DecimalNumberCustomField {
      floatValue
    }
    ... on DateCustomField {
      dateValue
    }
    ... on DateTimeCustomField {
      dateTimeValue
    }
    ... on TimeSpentCustomField {
      timeSpentValue
    }
    ... on SingleSelectionDropListCustomField {
      singleSelectionDropListValue
    }
    ... on MultipleSelectionDropListCustomField {
      multipleSelectionDropListValue
    }
    ... on UserCustomField {
      userAndGroupValue {
        ... on NormalUser {
          id
          name
        }
        ... on QaUser {
          id
          name
        }
        ... on PlaceholderUser {
          id
          name
        }
        ... on UserGroup {
          id
          name
        }
      }
    }
    ... on FunctionCustomField {
      value
    }
  }
`;

export const GET_CUSTOM_FIELDS_QUERY = /* GraphQL */ `
  ${CUSTOM_FIELD_FIELDS_FRAGMENT}
  query GetCustomFields($id: ID!) {
    customFields(id: $id) {
      ...CustomFieldFields
    }
  }
`;

export const GET_CUSTOM_FIELDS_SET_QUERY = /* GraphQL */ `
  ${CUSTOM_FIELD_FIELDS_FRAGMENT}
  query GetCustomFieldsSet($id: ID!) {
    customFieldsSet(id: $id) {
      ...CustomFieldFields
    }
  }
`;

/**
 * Set custom field mutations keyed by column __typename.
 * Each mutation returns the item { id } after setting the value.
 */
export const SET_CUSTOM_FIELD_MUTATIONS: Record<string, string> = {
  TextCustomColumn: /* GraphQL */ `
    mutation SetTextCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: String!
    ) {
      setTextCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,

  MultilineTextCustomColumn: /* GraphQL */ `
    mutation SetMultilineTextCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: String!
    ) {
      setMultilineTextCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,

  HyperlinkCustomColumn: /* GraphQL */ `
    mutation SetHyperlinkCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: String!
    ) {
      setHyperlinkCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  NumberCustomColumn: /* GraphQL */ `
    mutation SetNumberCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: Int!
    ) {
      setNumberCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  DecimalNumberCustomColumn: /* GraphQL */ `
    mutation SetDecimalNumberCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: Float!
    ) {
      setDecimalNumberCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  DateCustomColumn: /* GraphQL */ `
    mutation SetDateCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: ISODate!
    ) {
      setDateCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  DateTimeCustomColumn: /* GraphQL */ `
    mutation SetDateTimeCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: ISODateTime!
    ) {
      setDateTimeCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  TimeSpentCustomColumn: /* GraphQL */ `
    mutation SetTimeSpentCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: Float!
    ) {
      setTimeSpentCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  SingleSelectionDropListCustomColumn: /* GraphQL */ `
    mutation SetSingleSelectionDropListCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: ID!
    ) {
      setSingleSelectionDropListCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  MultipleSelectionDropListCustomColumn: /* GraphQL */ `
    mutation SetMultipleSelectionDropListCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $value: [ID]!
    ) {
      setMultipleSelectionDropListCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        value: $value
      ) {
        id
      }
    }
  `,
  UserCustomColumn: /* GraphQL */ `
    mutation SetUserCustomField(
      $taskID: ID!
      $customFieldID: ID!
      $usersAndGroups: UsersOrGroupsInput
    ) {
      setUserCustomFieldValue(
        taskID: $taskID
        customFieldID: $customFieldID
        usersAndGroups: $usersAndGroups
      ) {
        id
      }
    }
  `,
};
