// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import {
  DEFAULT_UPLOADS_PER_MINUTE,
  UploadGate,
  parseUploadsPerMinute,
} from './upload-gate';

describe('upload-gate', () => {
  describe('parseUploadsPerMinute', () => {
    it('reads whole numbers and falls back to the default otherwise', () => {
      expect(parseUploadsPerMinute(' 5 ')).toBe(5);
      expect(parseUploadsPerMinute('0')).toBe(0);
      expect(parseUploadsPerMinute(undefined)).toBe(DEFAULT_UPLOADS_PER_MINUTE);
      expect(parseUploadsPerMinute('-1')).toBe(DEFAULT_UPLOADS_PER_MINUTE);
      expect(parseUploadsPerMinute('lots')).toBe(DEFAULT_UPLOADS_PER_MINUTE);
      expect(parseUploadsPerMinute('2.5')).toBe(DEFAULT_UPLOADS_PER_MINUTE);
    });
  });

  describe('UploadGate', () => {
    it('runs tasks one after another, also after a failure', async () => {
      const gate = new UploadGate(0);
      const events: string[] = [];
      const task =
        (name: string, fail = false) =>
        async () => {
          events.push(`start ${name}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push(`end ${name}`);
          if (fail) throw new Error(name);
          return name;
        };

      const results = await Promise.allSettled([
        gate.run(task('a')),
        gate.run(task('b', true)),
        gate.run(task('c')),
      ]);

      expect(events).toEqual([
        'start a',
        'end a',
        'start b',
        'end b',
        'start c',
        'end c',
      ]);
      expect(results.map((r) => r.status)).toEqual([
        'fulfilled',
        'rejected',
        'fulfilled',
      ]);
    });

    it('allows the limit per 60 seconds and says how long to wait', () => {
      let now = 0;
      const gate = new UploadGate(2, () => now);

      gate.take();
      now = 10_000;
      gate.take();
      now = 20_000;
      expect(() => gate.take()).toThrow('Wait 40 seconds');
      now = 60_000;
      expect(() => gate.take()).not.toThrow();
      expect(() => gate.check()).toThrow('Wait 10 seconds');
    });

    it('has no limit when set to 0', () => {
      const gate = new UploadGate(0, () => 0);
      for (let i = 0; i < 100; i++) gate.take();
    });
  });
});
