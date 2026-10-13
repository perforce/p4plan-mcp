// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import configuration, { envFlag } from './configuration';

describe('envFlag', () => {
  it.each(['true', '1'])('is on for %j', (value) => {
    expect(envFlag(value)).toBe(true);
  });

  it.each([undefined, '', 'false', '0'])('is off for %j', (value) => {
    expect(envFlag(value)).toBe(false);
  });
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

    it.each(['true', '1'])('is enabled by P4PLAN_READONLY=%s', (value) => {
      process.env.P4PLAN_READONLY = value;
      expect(configuration().readOnly).toBe(true);
    });

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
