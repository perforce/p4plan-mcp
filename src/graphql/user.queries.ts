// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries for Users
 */

export const GET_CURRENT_USER_QUERY = /* GraphQL */ `
  query GetCurrentUser {
    authenticatedUser {
      id
      name
      ... on NormalUser {
        emailAddress
      }
    }
  }
`;

export const GET_PROJECT_USERS_QUERY = /* GraphQL */ `
  query GetProjectUsers($id: ID!) {
    project(id: $id) {
      id
      name
      users {
        user {
          id
          name
          ... on NormalUser {
            emailAddress
          }
        }
        accessRights {
          isMainManager
          limitedVisibility
        }
      }
    }
  }
`;
