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

export const ALL_PROJECTS_QUERY = /* GraphQL */ `
  query AllProjects {
    projects {
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

export const CREATE_PROJECT_MUTATION = /* GraphQL */ `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(createProjectInput: $input) {
      id
      name
    }
  }
`;

export const CLONE_PROJECT_MUTATION = /* GraphQL */ `
  mutation CloneProject($input: CloneProjectInput!) {
    cloneProject(cloneProjectInput: $input) {
      id
      name
    }
  }
`;

export const ADD_PROJECT_USER_MUTATION = /* GraphQL */ `
  mutation AddProjectUser($projectID: ID!, $userID: ID!) {
    addProjectUser(projectID: $projectID, userID: $userID) {
      id
    }
  }
`;

export const ADD_PROJECT_USER_GROUP_MUTATION = /* GraphQL */ `
  mutation AddProjectUserGroup($projectID: ID!, $userGroupID: ID!) {
    addProjectUserGroup(projectID: $projectID, userGroupID: $userGroupID) {
      id
    }
  }
`;

export const UPDATE_PROJECT_USER_ACCESS_RIGHTS_MUTATION = /* GraphQL */ `
  mutation UpdateProjectUserAccessRights(
    $projectID: ID!
    $userID: ID!
    $accessRights: ProjectUserAccessRightsInput!
  ) {
    updateProjectUserAccessRights(
      projectID: $projectID
      userID: $userID
      accessRights: $accessRights
    ) {
      accessRights {
        isMainManager
      }
    }
  }
`;

export const GET_PROJECT_MEMBER_IDS_QUERY = /* GraphQL */ `
  query GetProjectMemberIds($id: ID!) {
    project(id: $id) {
      users {
        user {
          id
        }
      }
    }
  }
`;

export const GET_USERS_AND_GROUPS_QUERY = /* GraphQL */ `
  query GetUsersAndGroups {
    users {
      __typename
      id
      name
      isDeleted
      isLocked
    }
    userGroups {
      id
      name
      project {
        id
      }
      users {
        id
      }
    }
  }
`;
