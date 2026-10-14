// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Keeps one MCP client from flooding the P4 Plan API with uploads (a model
 * stuck in a loop, or a prompt injection asking for many files). The API
 * holds each upload in memory before checking it, so uploads from this
 * server run one at a time, and at most P4PLAN_UPLOADS_PER_MINUTE start in
 * any 60 seconds.
 */

/** Environment variable with the per-minute upload limit (0 = no limit). */
export const UPLOADS_PER_MINUTE_ENV = 'P4PLAN_UPLOADS_PER_MINUTE';
export const DEFAULT_UPLOADS_PER_MINUTE = 20;

const WINDOW_MS = 60_000;

/**
 * Parse P4PLAN_UPLOADS_PER_MINUTE. A whole number of 0 or more is used as
 * is; anything else falls back to the default rather than to no limit.
 */
export function parseUploadsPerMinute(value: string | undefined): number {
  const text = (value ?? '').trim();
  return /^\d+$/.test(text) ? Number(text) : DEFAULT_UPLOADS_PER_MINUTE;
}

export class UploadGate {
  private queue: Promise<void> = Promise.resolve();
  private readonly started: number[] = [];

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Run `task` after every earlier upload has finished. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Throw a fix-it error when the per-minute limit is reached. */
  check(): void {
    if (this.perMinute === 0) return;
    const now = this.now();
    while (this.started.length > 0 && now - this.started[0] >= WINDOW_MS) {
      this.started.shift();
    }
    if (this.started.length >= this.perMinute) {
      const waitSeconds = Math.ceil(
        (WINDOW_MS - (now - this.started[0])) / 1000,
      );
      throw new Error(
        `upload_attachment: this MCP server allows ${this.perMinute} uploads per minute, and that limit is reached. ` +
          `Wait ${waitSeconds} seconds and try again. Do not retry in a loop; if the user really needs more, they can raise ${UPLOADS_PER_MINUTE_ENV}.`,
      );
    }
  }

  /** Check the limit and count one upload as started. */
  take(): void {
    this.check();
    if (this.perMinute !== 0) this.started.push(this.now());
  }
}
