// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries for Task Listings
 */

export const GET_TODO_LIST_QUERY = /* GraphQL */ `
  query GetTodoList($showOptions: ShowOptions) {
    todoList(showOptions: $showOptions) {
      id
      name
      projectID
      ... on Task {
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
      }
      ... on BacklogTask {
        backlogPriority
        sprintPriority
        estimatedDays
        workRemaining
        isUserStory
        userStory
      }
      ... on ScheduledTask {
        duration
        estimatedDays
        percentCompleted
        isUserStory
        userStory
      }
      ... on Bug {
        severity
        sprintPriority
        workRemaining
      }
    }
  }
`;
