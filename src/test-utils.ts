// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Shared test utilities for type-safe mock assertions.
 *
 * These helpers contain the `any` boundary from `JSON.parse()` and
 * `jest.Mock.mock.calls` so that no `any` leaks into test code,
 * satisfying @typescript-eslint/no-unsafe-assignment and
 * @typescript-eslint/no-unsafe-member-access rules.
 *
 * Mock interfaces use **property** signatures (`query: jest.Mock`) instead
 * of method signatures so that accessing e.g. `mockGraphqlClient.query`
 * is a property read, not an unbound-method reference — avoiding
 * @typescript-eslint/unbound-method violations.
 */

import type { McpToolResult } from './tools/tools.service';

// ---------------------------------------------------------------------------
// Mock interfaces — property signatures avoid `unbound-method` lint errors
// ---------------------------------------------------------------------------

/**
 * Structural mock for GraphQLClientService.
 * Every spec file that creates a mock graphql client should use this type
 * instead of `jest.Mocked<GraphQLClientService>`.
 */
export interface MockGraphQLClient {
  query: jest.Mock;
  login: jest.Mock;
  getCurrentUser: jest.Mock;
  downloadAttachment: jest.Mock;
}

/**
 * Typed tuple for GraphQL client `query()` mock calls.
 * Matches the signature: `query<T>(query: string, variables: Record<string, unknown>, authToken: string)`
 */
export type QueryCall = [
  query: string,
  variables: Record<string, unknown>,
  authToken: string,
];

/**
 * Type-safe wrapper for parsing MCP tool result JSON.
 * Converts the `any` returned by `JSON.parse` to a concrete type `T`
 * via an `unknown` intermediate, keeping `any` from leaking into callers.
 */
export function parseToolResult<T = Record<string, unknown>>(
  result: McpToolResult,
): T {
  return JSON.parse(result.content[0].text!) as unknown as T;
}

/**
 * Get a typed query call from a jest mock's call history by index.
 */
export function getQueryCall(mock: jest.Mock, index: number): QueryCall {
  const calls = mock.mock.calls as unknown[][];
  return calls[index] as QueryCall;
}

/**
 * Get the last typed query call from a jest mock's call history.
 */
export function getLastQueryCall(mock: jest.Mock): QueryCall {
  const calls = mock.mock.calls as unknown[][];
  return calls[calls.length - 1] as QueryCall;
}

/**
 * Get a typed call from any jest mock's call history.
 * Use when the mock signature doesn't match `QueryCall`.
 */
export function getMockCall<T extends unknown[]>(
  mock: jest.Mock,
  index: number,
): T {
  const calls = mock.mock.calls as unknown[][];
  return calls[index] as unknown as T;
}
