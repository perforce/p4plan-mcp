// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Which local files upload_attachment may read. A prompt injection could ask
 * for something like ~/.ssh/id_rsa, so only regular, non-hidden files inside
 * the client's roots or P4PLAN_UPLOAD_DIRS are read, after resolving symlinks.
 */

import { constants, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIRS_ENV, normaliseUploadPath } from '../config/configuration';

export interface OpenedUploadFile {
  handle: FileHandle;
  size: number;
  /** Name from the path the caller gave, before resolving symlinks. */
  name: string;
}

function fileUriToPath(uri: string): string | null {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

/** Real paths of the client roots and configured folders that exist. */
export async function allowedUploadRoots(
  clientRootUris: string[],
  uploadDirs: string[],
): Promise<string[]> {
  const candidates = [
    ...clientRootUris.map(fileUriToPath),
    ...uploadDirs.filter((dir) => path.isAbsolute(dir)),
  ].filter((dir): dir is string => dir !== null);

  const roots: string[] = [];
  for (const candidate of candidates) {
    const real = await fs.realpath(candidate).catch(() => null);
    const stats = real ? await fs.stat(real).catch(() => null) : null;
    if (real && stats?.isDirectory() && !roots.includes(real)) {
      roots.push(real);
    }
  }
  return roots;
}

/** Configured folders that cannot be used: not absolute, or not a folder. */
export async function unusableUploadDirs(
  uploadDirs: string[],
): Promise<string[]> {
  const unusable: string[] = [];
  for (const dir of uploadDirs) {
    const stats = path.isAbsolute(dir)
      ? await fs.stat(dir).catch(() => null)
      : null;
    if (!stats?.isDirectory()) unusable.push(dir);
  }
  return unusable;
}

/**
 * Path segments of `target` below `root`, or null when it is not inside.
 * Real paths carry the case stored on disk, so they are compared exactly.
 */
function segmentsBelow(root: string, target: string): string[] | null {
  const relative = path.relative(root, target);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep);
}

/**
 * Real path of a missing file, from its nearest existing parent. Null when
 * the path runs through a broken symlink, whose target is unknown.
 */
async function realpathOfNearestParent(target: string): Promise<string | null> {
  const rest: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    const real = await fs.realpath(current).catch(() => null);
    if (real) return path.join(real, ...rest);
    const link = await fs.lstat(current).catch(() => null);
    if (link?.isSymbolicLink()) return null;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(target);
    rest.unshift(path.basename(current));
    current = parent;
  }
}

function describeRoots(roots: string[]): string {
  return roots.map((root) => `"${root}"`).join(', ');
}

/**
 * Check `rawPath` against the allowed folders and open it for reading.
 * The caller must close the returned handle.
 */
export async function openUploadFile(
  rawPath: string,
  roots: string[],
): Promise<OpenedUploadFile> {
  if (roots.length === 0) {
    throw new Error(
      `upload_attachment: no upload folders are configured, so local files cannot be read. ` +
        `Your MCP client did not share any workspace folders (roots); set ${UPLOAD_DIRS_ENV} to the folder(s) files may be uploaded from. ` +
        `With Docker, mount the folder into the container (-v) and set ${UPLOAD_DIRS_ENV} to the path inside the container. ` +
        `Text can still be attached with content + fileName.`,
    );
  }

  let input = normaliseUploadPath(rawPath);
  if (input === '') {
    throw new Error(`upload_attachment: 'filePath' is empty.`);
  }
  if (!path.isAbsolute(input)) {
    if (roots.length !== 1) {
      throw new Error(
        `upload_attachment: "${rawPath}" is a relative path. Pass an absolute path inside one of the upload folders: ${describeRoots(roots)}.`,
      );
    }
    input = path.resolve(roots[0], input);
  }

  const outsideError = () =>
    new Error(
      `upload_attachment: "${input}" is outside the folders this MCP server may read (${describeRoots(roots)}). ` +
        `Tell the user; do not copy or move the file to get around this. If they want files from that folder, they can add it to ${UPLOAD_DIRS_ENV}.`,
    );
  const notAFileError = () =>
    new Error(
      `upload_attachment: "${input}" is not a regular file. Only files can be uploaded.`,
    );

  const real = await fs.realpath(input).catch(() => null);
  if (real === null) {
    // Same error as for existing files, so the tool cannot reveal what exists.
    const resolved = await realpathOfNearestParent(input);
    if (
      resolved === null ||
      roots.every((root) => segmentsBelow(root, resolved) === null)
    ) {
      throw outsideError();
    }
    throw new Error(
      `upload_attachment: file not found: "${input}". Check the path; it must be an existing file inside one of the upload folders: ${describeRoots(roots)}.`,
    );
  }

  const placements = roots
    .map((root) => segmentsBelow(root, real))
    .filter((segments): segments is string[] => segments !== null);
  if (placements.length === 0) throw outsideError();
  if (placements.every((segments) => segments.some((s) => s.startsWith('.')))) {
    throw new Error(
      `upload_attachment: "${input}" is a hidden file or inside a hidden folder (a name starting with "."), which is never uploaded because such files often hold credentials or settings. ` +
        `Tell the user; do not copy or rename the file to get around this.`,
    );
  }

  // Opening a FIFO blocks, so check the type before opening as well as after.
  if (!(await fs.stat(real)).isFile()) throw notAFileError();
  const handle = await fs.open(
    real,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw notAFileError();
    // A parent folder swapped for a symlink after the check changes these.
    const [realAgain, onDisk] = await Promise.all([
      fs.realpath(real).catch(() => null),
      fs.stat(real).catch(() => null),
    ]);
    if (
      realAgain !== real ||
      onDisk?.dev !== opened.dev ||
      onDisk?.ino !== opened.ino
    ) {
      throw new Error(
        `upload_attachment: "${input}" changed while it was being opened. Try again once the file has stopped changing.`,
      );
    }
    // A hard link can share its content with a file outside the folders.
    if (opened.nlink > 1) {
      throw new Error(
        `upload_attachment: "${input}" is a hard link to another file, which is not uploaded. Tell the user; do not copy the file to get around this.`,
      );
    }
    return { handle, size: opened.size, name: path.basename(input) };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * Validate an attachment file name. The server keeps only the part after the
 * last slash, so names with folders are refused rather than silently changed.
 */
export function validateAttachmentFileName(fileName: string): string {
  const name = fileName.trim();
  if (name === '' || name === '.' || name === '..') {
    throw new Error(
      `upload_attachment: 'fileName' must be a file name such as "screenshot.png".`,
    );
  }
  // eslint-disable-next-line no-control-regex
  if (/[/\\\x00-\x1f\x7f]/.test(name)) {
    throw new Error(
      `upload_attachment: 'fileName' "${fileName}" must be just a name such as "crash.log", without folders or control characters.`,
    );
  }
  return name;
}
