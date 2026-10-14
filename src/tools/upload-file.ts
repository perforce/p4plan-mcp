// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Which local files upload_attachment may read. Reading local files is a new
 * way for data to leave the machine (a prompt injection could ask for
 * ~/.ssh/id_rsa), so only files inside allowed folders are read: the MCP
 * client's roots plus P4PLAN_UPLOAD_DIRS. Symlinks are resolved before the
 * check, hidden files and folders are refused, and only regular files are
 * opened (a device or FIFO would stream forever, and there is no size limit).
 */

import { constants, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Environment variable listing extra folders upload_attachment may read. */
export const UPLOAD_DIRS_ENV = 'P4PLAN_UPLOAD_DIRS';

export interface OpenedUploadFile {
  handle: FileHandle;
  size: number;
  /** File name from the path the caller gave (before resolving symlinks). */
  name: string;
}

/** Turn a file:// URI, ~ path or quoted path into a plain path string. */
function normalisePathInput(raw: string): string {
  let value = raw
    .trim()
    .replace(/^(["'`])(.*)\1$/s, '$2')
    .trim();
  if (/^file:\/\//i.test(value)) {
    try {
      value = fileURLToPath(value);
    } catch {
      throw new Error(
        `upload_attachment: "${raw}" is not a valid file:// URI. Pass an absolute file path instead.`,
      );
    }
  }
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

/** Split P4PLAN_UPLOAD_DIRS on the OS path-list separator (":" or ";"). */
export function parseUploadDirs(value: string | undefined): string[] {
  return (value ?? '')
    .split(path.delimiter)
    .map((dir) => normalisePathInput(dir))
    .filter((dir) => dir !== '');
}

/**
 * The folders uploads may come from: client roots (file:// URIs) plus the
 * configured folders, each resolved to its real path. Folders that do not
 * exist, and roots that are not file:// URIs, are dropped.
 */
export async function allowedUploadRoots(
  clientRootUris: string[],
  uploadDirs: string[],
): Promise<string[]> {
  const candidates: string[] = [];
  for (const uri of clientRootUris) {
    try {
      candidates.push(fileURLToPath(uri));
    } catch {
      // Not a file:// root; nothing on disk to allow.
    }
  }
  candidates.push(...uploadDirs.filter((dir) => path.isAbsolute(dir)));

  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      const real = await fs.realpath(candidate);
      if ((await fs.stat(real)).isDirectory() && !roots.includes(real)) {
        roots.push(real);
      }
    } catch {
      // Missing or unreadable folder.
    }
  }
  return roots;
}

/**
 * Path segments of `target` below `root`, or null when it is not inside.
 * Both are real paths, which carry the case stored on disk, so they are
 * compared exactly (ignoring case would let "work" pass for root "Work" on a
 * case-sensitive volume).
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
 * Real path of a missing file: its nearest existing parent, resolved. Null
 * when the path runs through a broken symlink, whose target (possibly
 * outside the folders) is unknown.
 */
async function realpathOfNearestParent(target: string): Promise<string | null> {
  const rest: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    try {
      return path.join(await fs.realpath(current), ...rest);
    } catch {
      const link = await fs.lstat(current).catch(() => null);
      if (link?.isSymbolicLink()) return null;
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      rest.unshift(path.basename(current));
      current = parent;
    }
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

  let input = normalisePathInput(rawPath);
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

  let real: string;
  try {
    real = await fs.realpath(input);
  } catch {
    // Same answer as for an existing file outside the folders, so the tool
    // does not reveal which files exist elsewhere.
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

  const insideSomeRoot = roots
    .map((root) => segmentsBelow(root, real))
    .filter((segments): segments is string[] => segments !== null);
  if (insideSomeRoot.length === 0) throw outsideError();
  if (
    insideSomeRoot.every((segments) => segments.some((s) => s.startsWith('.')))
  ) {
    throw new Error(
      `upload_attachment: "${input}" is a hidden file or inside a hidden folder (a name starting with "."), which is never uploaded because such files often hold credentials or settings. ` +
        `Tell the user; do not copy or rename the file to get around this.`,
    );
  }

  // Refuse devices, FIFOs and folders before opening (opening a FIFO blocks).
  const stats = await fs.stat(real);
  if (!stats.isFile()) {
    throw new Error(
      `upload_attachment: "${input}" is not a regular file. Only files can be uploaded.`,
    );
  }

  const flags =
    constants.O_RDONLY |
    (constants.O_NOFOLLOW ?? 0) |
    (constants.O_NONBLOCK ?? 0);
  const handle = await fs.open(real, flags);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw new Error(
        `upload_attachment: "${input}" is not a regular file. Only files can be uploaded.`,
      );
    }
    // A hard link looks like a normal file but may share its content with a
    // file outside the folders or a hidden one, so only single links are read.
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
 * Validate the attachment file name. The server keeps only the part after
 * the last slash, so slashes would silently change the name.
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
