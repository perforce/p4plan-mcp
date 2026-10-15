// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import configuration, {
  envFlag,
  normaliseUploadPath,
  parseReadOnlyEnv,
  parseUploadDirs,
} from './configuration';

describe('envFlag', () => {
  it.each(['true', '1'])('is on for %j', (value) => {
    expect(envFlag(value)).toBe(true);
  });

  it.each([undefined, '', 'false', '0'])('is off for %j', (value) => {
    expect(envFlag(value)).toBe(false);
  });
});

describe('parseReadOnlyEnv', () => {
  it.each(['true', '1', 'yes', 'on', 'TRUE', 'True', ' true ', 'true\n', 'ON'])(
    'turns read-only on for %j',
    (value) => {
      expect(parseReadOnlyEnv(value)).toEqual({
        readOnly: true,
        recognised: true,
      });
    },
  );

  it.each([undefined, '', '  ', 'false', '0', 'no', 'off', 'FALSE', ' Off '])(
    'leaves read-only off for %j',
    (value) => {
      expect(parseReadOnlyEnv(value)).toEqual({
        readOnly: false,
        recognised: true,
      });
    },
  );

  it.each(['ture', 'enabled', 'readonly', '2'])(
    'fails closed for the unrecognised value %j',
    (value) => {
      expect(parseReadOnlyEnv(value)).toEqual({
        readOnly: true,
        recognised: false,
      });
    },
  );
});

describe('configuration', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    process.argv = ['node', 'dist/main.js'];
    process.env = { ...originalEnv };
    delete process.env.P4PLAN_READONLY;
    delete process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS;
  });

  afterAll(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe('readOnly', () => {
    it('is off by default', () => {
      expect(configuration().readOnly).toBe(false);
    });

    it('is enabled by the --readonly argument', () => {
      process.argv = ['node', 'dist/main.js', '--readonly'];
      expect(configuration().readOnly).toBe(true);
    });

    it('ignores --readonly in the node and script positions', () => {
      process.argv = ['--readonly', 'dist/main.js'];
      expect(configuration().readOnly).toBe(false);
    });

    it.each(['true', '1', 'TRUE', 'yes', 'typo'])(
      'is enabled by P4PLAN_READONLY=%s',
      (value) => {
        process.env.P4PLAN_READONLY = value;
        expect(configuration().readOnly).toBe(true);
      },
    );

    it.each(['false', '0', ''])('stays off for P4PLAN_READONLY=%j', (value) => {
      process.env.P4PLAN_READONLY = value;
      expect(configuration().readOnly).toBe(false);
    });

    it('stays on with --readonly even when P4PLAN_READONLY=false', () => {
      process.argv = ['node', 'dist/main.js', '--readonly'];
      process.env.P4PLAN_READONLY = 'false';
      expect(configuration().readOnly).toBe(true);
    });
  });

  describe('allowSelfSignedCerts', () => {
    it.each([
      ['true', true],
      ['1', true],
      ['false', false],
      [undefined, false],
    ])('P4PLAN_ALLOW_SELF_SIGNED_CERTS=%j gives %s', (value, expected) => {
      if (value !== undefined)
        process.env.P4PLAN_ALLOW_SELF_SIGNED_CERTS = value;
      expect(configuration().allowSelfSignedCerts).toBe(expected);
    });
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

describe('normaliseUploadPath', () => {
  it('unquotes paths and converts file:// URIs', () => {
    expect(normaliseUploadPath(' "/a b/c.txt" ')).toBe('/a b/c.txt');
    expect(normaliseUploadPath('file:///a%20b/c.txt')).toBe('/a b/c.txt');
    expect(normaliseUploadPath('~')).toBe(homedir());
  });
});
