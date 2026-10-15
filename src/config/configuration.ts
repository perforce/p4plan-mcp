// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { homedir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Command-line argument that turns on read-only mode. */
export const READ_ONLY_ARG = '--readonly';

/** True when an on/off environment setting is set to "true" or "1". */
export function envFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

const READ_ONLY_ON = ['true', '1', 'yes', 'on'];
const READ_ONLY_OFF = ['false', '0', 'no', 'off', ''];

/**
 * Parse P4PLAN_READONLY. It is a safety switch, so it fails closed: case and
 * surrounding spaces are ignored, and a value that is neither on nor off
 * turns read-only mode on (main.ts warns about it).
 */
export function parseReadOnlyEnv(value: string | undefined): {
  readOnly: boolean;
  recognised: boolean;
} {
  const key = (value ?? '').trim().toLowerCase();
  if (READ_ONLY_ON.includes(key)) return { readOnly: true, recognised: true };
  if (READ_ONLY_OFF.includes(key)) return { readOnly: false, recognised: true };
  return { readOnly: true, recognised: false };
}

export const UPLOAD_DIRS_ENV = 'P4PLAN_UPLOAD_DIRS';

/** Strip quotes around a path and expand a leading ~. */
function expandPath(raw: string): string {
  const value = raw
    .trim()
    .replace(/^(["'`])(.*)\1$/s, '$2')
    .trim();
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

/** Turn a file:// URI, ~ path or quoted path into a plain path. */
export function normaliseUploadPath(raw: string): string {
  const value = expandPath(raw);
  if (!/^file:\/\//i.test(value)) return value;
  try {
    return fileURLToPath(value);
  } catch {
    throw new Error(
      `upload_attachment: "${raw}" is not a valid file:// URI. Pass an absolute file path instead.`,
    );
  }
}

/** Plain paths only: a file:// URI would be split apart on ":". */
export function parseUploadDirs(value: string | undefined): string[] {
  return (value ?? '')
    .split(path.delimiter)
    .map(expandPath)
    .filter((dir) => dir !== '');
}

export default () => ({
  graphqlUrl: process.env.P4PLAN_API_URL ?? 'http://localhost:4000',
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  searchLimit: parseInt(process.env.SEARCH_LIMIT ?? '400', 10),
  allowSelfSignedCerts: envFlag(process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS),
  // Read-only mode (--readonly / P4PLAN_READONLY): only tools that read are
  // registered, and the GraphQL client refuses to send mutations.
  readOnly:
    parseReadOnlyEnv(process.env.P4PLAN_READONLY).readOnly ||
    process.argv.slice(2).includes(READ_ONLY_ARG),
  uploadDirs: parseUploadDirs(process.env[UPLOAD_DIRS_ENV]),
});
