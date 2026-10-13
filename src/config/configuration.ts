// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/** Command-line argument that turns on read-only mode. */
export const READ_ONLY_ARG = '--readonly';

/** True when an on/off environment setting is set to "true" or "1". */
export function envFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export default () => ({
  graphqlUrl: process.env.P4PLAN_API_URL ?? 'http://localhost:4000',
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  searchLimit: parseInt(process.env.SEARCH_LIMIT ?? '400', 10),
  allowSelfSignedCerts: envFlag(process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS),
  // Read-only mode (--readonly / P4PLAN_READONLY): only tools that read are
  // registered, and the GraphQL client refuses to send mutations.
  readOnly:
    envFlag(process.env.P4PLAN_READONLY) ||
    process.argv.slice(2).includes(READ_ONLY_ARG),
});
