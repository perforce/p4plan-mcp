// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries for Projects
 */

export const LIST_PROJECTS_QUERY = /* GraphQL */ `
  query ListProjects {
    userProjects {
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

export const GET_PROJECT_QUERY = /* GraphQL */ `
  query GetProject($id: ID!) {
    project(id: $id) {
      id
      name
      archivedStatus
      backlog {
        id
      }
      qa {
        id
      }
    }
  }
`;

export const GET_PROJECT_QA_QUERY = /* GraphQL */ `
  query GetProjectQa($id: ID!) {
    project(id: $id) {
      id
      name
      qa {
        id
      }
    }
  }
`;

export const GET_PROJECT_BACKLOG_QUERY = /* GraphQL */ `
  query GetProjectBacklog($id: ID!) {
    project(id: $id) {
      id
      name
      backlog {
        id
      }
    }
  }
`;
