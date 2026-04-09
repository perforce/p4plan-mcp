// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

export default () => ({
  graphqlUrl: process.env.P4PLAN_API_URL ?? 'http://localhost:4000',
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  searchLimit: parseInt(process.env.SEARCH_LIMIT ?? '400', 10),
  allowSelfSignedCerts:
    process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS === 'true' ||
    process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS === '1',
});
