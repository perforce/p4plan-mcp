// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries and Mutations for Task CRUD Operations
 */

export const GET_PROJECT_SECTIONS_QUERY = /* GraphQL */ `
  query GetProjectSections($id: ID!) {
    project(id: $id) {
      id
      name
      backlog {
        id
      }
      qa {
        id
      }
    }
  }
`;

export const GET_TASK_TYPE_QUERY = /* GraphQL */ `
  query GetTaskType($id: ID!) {
    item(id: $id) {
      __typename
    }
  }
`;

export const GET_TASKS_QUERY = /* GraphQL */ `
  query GetTasks($ids: [ID!]!) {
    itemsByIDs(ids: $ids) {
      id
      localID
      name
      projectID
      createdOn
      lastUpdatedOn
      links {
        relation
        notes
        ... on InternalLink {
          fromItem {
            id
            name
          }
          toItem {
            id
            name
          }
        }
        ... on ExternalLink {
          fromItem {
            id
            name
          }
          url
        }
      }
      ... on Task {
        committedToProjectID
        status
        confidence
        risk
        workflow {
          id
          name
        }
        workflowStatus {
          id
          name
        }
        assignedTo {
          user {
            id
            name
          }
        }
      }
      ... on BacklogTask {
        backlogPriority
        sprintPriority
        estimatedDays
        points
        workRemaining
        isUserStory
        userStory
        createdFromWorkflow
        canBeBrokenDown
        canHaveWorkflowType
        linkedToPipelineTask {
          id
          name
        }
      }
      ... on Bug {
        severity
        bugPriority
        sprintPriority
        detailedDescription
        stepsToReproduce
        workRemaining
      }
      ... on ScheduledTask {
        duration
        estimatedDays
        percentCompleted
        isUserStory
        userStory
        createdFromWorkflow
        canBeBrokenDown
        canHaveWorkflowType
        linkedToPipelineTask {
          id
          name
        }
      }
      ... on Sprint {
        start
        finish
        duration
        allocations {
          user {
            id
            name
          }
          percentageAllocation
        }
      }
    }
  }
`;

export const CREATE_BACKLOG_TASKS_MUTATION = /* GraphQL */ `
  mutation CreateBacklogTasks(
    $projectID: ID!
    $createBacklogTasksInput: [CreateBacklogTaskInput]!
    $previousItemID: ID
  ) {
    createBacklogTasks(
      projectID: $projectID
      createBacklogTasksInput: $createBacklogTasksInput
      previousItemID: $previousItemID
    ) {
      id
      projectID
      localID
      name
      status
      backlogPriority
    }
  }
`;

export const CREATE_SPRINT_TASKS_MUTATION = /* GraphQL */ `
  mutation CreateSprintTasks(
    $sprintID: ID!
    $createSprintTasksInput: [CreateSprintTaskInput]!
    $previousItemID: ID
  ) {
    createSprintTasks(
      sprintID: $sprintID
      createSprintTasksInput: $createSprintTasksInput
      previousItemID: $previousItemID
    ) {
      id
      projectID
      localID
      name
      status
      backlogPriority
    }
  }
`;

export const SEARCH_TASKS_QUERY = /* GraphQL */ `
  query SearchTasks($id: ID!, $findQuery: String!, $limit: Int) {
    items(id: $id, findQuery: $findQuery, limit: $limit) {
      __typename
      id
      localID
      name
      subprojectPath
      projectID
      ... on Task {
        committedToProjectID
      }
      ... on BacklogTask {
        status
      }
      ... on ScheduledTask {
        status
      }
      ... on Bug {
        status
      }
    }
  }
`;

// Note: Update mutations are built dynamically by buildUpdateMutation helper
// based on task type (BacklogTask, Bug, ScheduledTask)

const assignedToFields = `assignedTo {
          user {
            id
            name
          }
        }`;

/**
 * Fields returned by update_item, per item type.
 *
 * These are selection sets rather than whole operations: buildUpdateMutation
 * assembles the mutation around them at runtime, picking the set by task type.
 * They live here with the other GraphQL text so the query tests can assert the
 * invariant that every item-returning operation selects localID.
 */
export const UPDATE_ITEM_RETURN_FIELDS: Record<string, string> = {
  Bug: `id
        projectID
        localID
        name
        status
        bugPriority
        sprintPriority
        severity
        workRemaining
        detailedDescription
        stepsToReproduce
        ${assignedToFields}
        workflowStatus {
          id
          name
        }`,
  ScheduledTask: `id
        projectID
        localID
        name
        status
        backlogPriority
        points
        estimatedDays
        percentCompleted
        isUserStory
        userStory
        ${assignedToFields}
        workflowStatus {
          id
          name
        }`,
  BacklogTask: `id
        projectID
        localID
        name
        status
        backlogPriority
        sprintPriority
        points
        estimatedDays
        workRemaining
        isUserStory
        userStory
        ${assignedToFields}
        workflowStatus {
          id
          name
        }`,
};

/** Return fields for the status-only update used by complete_task / start_task. */
export const UPDATE_STATUS_RETURN_FIELDS = `id
        projectID
        localID
        name
        status`;
