// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries and Mutations for Authentication
 */

export const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($loginUserInput: LoginUserInput!) {
    login(loginUserInput: $loginUserInput) {
      access_token
    }
  }
`;

export const VALIDATE_TOKEN_QUERY = /* GraphQL */ `
  query GetCurrentUser {
    authenticatedUser {
      id
      name
    }
  }
`;
