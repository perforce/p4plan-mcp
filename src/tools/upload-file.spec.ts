// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  allowedUploadRoots,
  openUploadFile,
  parseUploadDirs,
  validateAttachmentFileName,
} from './upload-file';

describe('upload-file', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'p4plan-upload-'));
    root = join(base, 'root');
    outside = join(base, 'root-evil');
    mkdirSync(join(root, 'sub'), { recursive: true });
    mkdirSync(join(root, '.ssh'));
    mkdirSync(outside);
    writeFileSync(join(root, 'sub', 'shot.png'), 'png-bytes');
    writeFileSync(join(root, '.env'), 'SECRET=1');
    writeFileSync(join(root, '.ssh', 'id_rsa'), 'KEY');
    writeFileSync(join(outside, 'secret.txt'), 'nope');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  async function roots(...dirs: string[]): Promise<string[]> {
    return allowedUploadRoots([], dirs);
  }

  async function opened(rawPath: string, allowed: string[]) {
    const file = await openUploadFile(rawPath, allowed);
    await file.handle.close();
    return { size: file.size, name: file.name };
  }

  describe('allowedUploadRoots', () => {
    it('combines client roots and configured folders, resolving symlinks', async () => {
      const link = join(base, 'link-to-root');
      symlinkSync(root, link);

      const result = await allowedUploadRoots(
        [pathToFileURL(link).href, 'https://example.com/not-a-file-root'],
        [outside, join(base, 'missing'), 'relative/dir'],
      );

      expect(result).toHaveLength(2);
      expect(result[0].endsWith('root')).toBe(true);
      expect(result[1].endsWith('root-evil')).toBe(true);
    });
  });

  describe('parseUploadDirs', () => {
    it('splits on the OS path-list separator and expands ~', () => {
      expect(parseUploadDirs(`/a${delimiter} ~/b ${delimiter}`)).toEqual([
        '/a',
        join(homedir(), 'b'),
      ]);
      expect(parseUploadDirs(undefined)).toEqual([]);
    });
  });

  describe('openUploadFile', () => {
    it('opens a file inside an allowed folder', async () => {
      const allowed = await roots(root);

      await expect(
        opened(join(root, 'sub', 'shot.png'), allowed),
      ).resolves.toEqual({ size: 9, name: 'shot.png' });
    });

    it('accepts quoted paths and file:// URIs', async () => {
      const allowed = await roots(root);
      const file = join(root, 'sub', 'shot.png');

      await expect(opened(`  "${file}" `, allowed)).resolves.toMatchObject({
        name: 'shot.png',
      });
      await expect(
        opened(pathToFileURL(file).href, allowed),
      ).resolves.toMatchObject({ name: 'shot.png' });
    });

    it('resolves a relative path only when there is a single folder', async () => {
      await expect(
        opened('sub/shot.png', await roots(root)),
      ).resolves.toMatchObject({ name: 'shot.png' });
      await expect(
        opened('sub/shot.png', await roots(root, outside)),
      ).rejects.toThrow('relative path');
    });

    it('refuses files outside the folders, including a sibling with the same prefix', async () => {
      await expect(
        opened(join(outside, 'secret.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
      await expect(
        opened(join(root, '..', 'root-evil', 'secret.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
    });

    it('refuses a symlink that points out of the folder', async () => {
      symlinkSync(join(outside, 'secret.txt'), join(root, 'innocent.txt'));

      await expect(
        opened(join(root, 'innocent.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
    });

    it('refuses hidden files and folders, also through a symlink', async () => {
      const allowed = await roots(root);
      symlinkSync(join(root, '.ssh', 'id_rsa'), join(root, 'key.txt'));

      await expect(opened(join(root, '.env'), allowed)).rejects.toThrow(
        'hidden',
      );
      await expect(
        opened(join(root, '.ssh', 'id_rsa'), allowed),
      ).rejects.toThrow('hidden');
      await expect(opened(join(root, 'key.txt'), allowed)).rejects.toThrow(
        'hidden',
      );
    });

    it('refuses folders, devices and FIFOs', async () => {
      const fifo = join(root, 'pipe');
      execFileSync('mkfifo', [fifo]);

      await expect(
        opened(join(root, 'sub'), await roots(root)),
      ).rejects.toThrow('not a regular file');
      await expect(opened(fifo, await roots(root))).rejects.toThrow(
        'not a regular file',
      );
      await expect(opened('/dev/zero', await roots('/dev'))).rejects.toThrow(
        'not a regular file',
      );
    });

    it('explains how to allow folders when none are configured', async () => {
      await expect(opened(join(root, 'sub', 'shot.png'), [])).rejects.toThrow(
        'P4PLAN_UPLOAD_DIRS',
      );
    });

    it('does not reveal whether a file outside the folders exists', async () => {
      await expect(
        opened(join(outside, 'missing.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
    });

    it('does not reveal existence through a broken symlink', async () => {
      symlinkSync(join(outside, 'missing.txt'), join(root, 'dangling.txt'));
      symlinkSync(join(outside, 'missing-dir'), join(root, 'dangling-dir'));

      await expect(
        opened(join(root, 'dangling.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
      await expect(
        opened(join(root, 'dangling-dir', 'x.txt'), await roots(root)),
      ).rejects.toThrow('outside the folders');
    });

    it('refuses hard links, which can share content with an outside file', async () => {
      linkSync(join(outside, 'secret.txt'), join(root, 'hard.txt'));

      await expect(
        opened(join(root, 'hard.txt'), await roots(root)),
      ).rejects.toThrow('hard link');
    });

    it('compares folder names exactly, not ignoring case', async () => {
      // On a case-insensitive volume "ROOT" is the same folder as "root" and
      // realpath returns the stored name; on a case-sensitive one it is a
      // different folder. Either way a different-case sibling is not inside.
      const upper = join(base, 'Root2');
      const lower = join(base, 'root2');
      mkdirSync(upper);
      writeFileSync(join(upper, 'ok.txt'), 'ok');
      if (!existsSync(join(lower, 'ok.txt'))) {
        mkdirSync(lower);
        writeFileSync(join(lower, 'secret.txt'), 'nope');
        await expect(
          opened(join(lower, 'secret.txt'), await roots(upper)),
        ).rejects.toThrow('outside the folders');
      }
      await expect(
        opened(join(upper, 'ok.txt'), await roots(upper)),
      ).resolves.toMatchObject({ name: 'ok.txt' });
    });

    it('treats a name starting with ".." as hidden, not as outside', async () => {
      writeFileSync(join(root, '..notes.txt'), 'x');

      await expect(
        opened(join(root, '..notes.txt'), await roots(root)),
      ).rejects.toThrow('hidden');
    });

    it('reports a missing file', async () => {
      await expect(
        opened(join(root, 'nope.txt'), await roots(root)),
      ).rejects.toThrow('file not found');
    });
  });

  describe('validateAttachmentFileName', () => {
    it('trims a valid name', () => {
      expect(validateAttachmentFileName('  crash.log ')).toBe('crash.log');
    });

    it.each(['', '  ', '.', '..', 'a/b.txt', 'a\\b.txt', 'a\nb.txt', 'a\0b'])(
      'rejects %j',
      (name) => {
        expect(() => validateAttachmentFileName(name)).toThrow('fileName');
      },
    );
  });
});
