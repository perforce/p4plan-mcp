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
