// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries and Mutations for Task Actions
 */

export const COMMIT_TO_SPRINT_MUTATION = /* GraphQL */ `
  mutation CommitToSprint($taskID: ID!, $sprintID: ID!) {
    commitToSprint(taskID: $taskID, sprintID: $sprintID) {
      id
      name
    }
  }
`;

export const CREATE_BUG_MUTATION = /* GraphQL */ `
  mutation CreateBug($projectID: ID!, $createBugsInput: [CreateBugInput]!) {
    createBugs(projectID: $projectID, createBugsInput: $createBugsInput) {
      id
      projectID
      localID
      name
      status
      severity
      bugPriority
      detailedDescription
      stepsToReproduce
      createdBy {
        id
        name
      }
      createdOn
    }
  }
`;

export const CREATE_SCHEDULED_TASK_MUTATION = /* GraphQL */ `
  mutation CreateScheduledTask(
    $projectID: ID!
    $createScheduledTasksInput: [CreateScheduledTaskInput]!
    $previousItemID: ID
  ) {
    createScheduledTasks(
      projectID: $projectID
      createScheduledTasksInput: $createScheduledTasksInput
      previousItemID: $previousItemID
    ) {
      id
      projectID
      localID
      name
      status
      estimatedDays
      percentCompleted
      createdBy {
        id
        name
      }
      createdOn
    }
  }
`;

// Note: update_item uses the buildUpdateMutation helper
// which dynamically generates the mutation based on task type

export const UPDATE_SPRINT_MUTATION = /* GraphQL */ `
  mutation UpdateSprint($updateSprintInput: UpdateSprintInput!) {
    updateSprint(updateSprintInput: $updateSprintInput) {
      id
      name
      start
      finish
      duration
      status
      allocations {
        user {
          id
          name
        }
        percentageAllocation
      }
    }
  }
`;

export const UPDATE_RELEASE_MUTATION = /* GraphQL */ `
  mutation UpdateRelease($updateReleaseInput: UpdateReleaseInput!) {
    updateRelease(updateReleaseInput: $updateReleaseInput) {
      id
      name
      date
      hidden
    }
  }
`;

export const CREATE_SPRINT_MUTATION = /* GraphQL */ `
  mutation CreateSprint(
    $projectID: ID!
    $createSprintInput: CreateSprintInput!
    $previousItemID: ID
  ) {
    createSprint(
      projectID: $projectID
      createSprintInput: $createSprintInput
      previousItemID: $previousItemID
    ) {
      id
      name
      start
      finish
      duration
      status
      allocations {
        user {
          id
          name
        }
        percentageAllocation
      }
    }
  }
`;

export const UNCOMMIT_FROM_SPRINT_MUTATION = /* GraphQL */ `
  mutation UncommitFromSprint($taskID: ID!) {
    uncommitFromSprint(taskID: $taskID) {
      id
      name
    }
  }
`;

export const CREATE_RELEASE_MUTATION = /* GraphQL */ `
  mutation CreateRelease(
    $projectID: ID!
    $createReleaseInput: CreateReleaseInput!
    $previousItemID: ID
  ) {
    createRelease(
      projectID: $projectID
      createReleaseInput: $createReleaseInput
      previousItemID: $previousItemID
    ) {
      id
      name
      ... on Release {
        date
      }
    }
  }
`;
