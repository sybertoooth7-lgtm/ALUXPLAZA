import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for lib/email-queue.js with PgBoss stubbed at the module boundary.
 * Nothing here touches Postgres, so the file runs in the detector-only CI job
 * as well as the full `test-backend` run.
 */

const send = vi.fn();
const createQueue = vi.fn();
const updateQueue = vi.fn();
const work = vi.fn();
const stop = vi.fn();
const getQueueStats = vi.fn();
const start = vi.fn();
const constructorArgs = [];

vi.mock('pg-boss', () => ({
  // Named export only — pg-boss has no default export.
  PgBoss: class PgBoss {
    constructor(options) {
      constructorArgs.push(options);
      this.start = start;
      this.send = send;
      this.createQueue = createQueue;
      this.updateQueue = updateQueue;
      this.work = work;
      this.stop = stop;
      this.getQueueStats = getQueueStats;
    }
    on() {}
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../src/lib/email-queue.js');
};

describe('lib/email-queue.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructorArgs.length = 0;
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
    start.mockResolvedValue(undefined);
    createQueue.mockResolvedValue(undefined);
    updateQueue.mockResolvedValue(undefined);
    work.mockResolvedValue('worker-id');
    stop.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Don't leak a live queue into the next test.
    const mod = await load().catch(() => null);
    if (mod) await mod.stopEmailQueue().catch(() => {});
    delete process.env.DATABASE_URL;
  });

  it('starts and creates the email queue with retry settings', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    expect(start).toHaveBeenCalled();
    expect(createQueue).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({
        retryLimit: 5,
        retryBackoff: true,
      })
    );
  });

  it('keeps finished jobs for 24 hours, not the pg-boss default of 7 days', async () => {
    // Each job holds a recipient address and, for contact notifications, the
    // sender's message. The privacy policy says about 24 hours.
    const mod = await load();
    expect(mod.QUEUE_OPTIONS.deleteAfterSeconds).toBe(86400);
    expect(mod.QUEUE_OPTIONS.retentionSeconds).toBe(86400);
    await mod.startEmailQueue();
    expect(createQueue).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({ deleteAfterSeconds: 86400 })
    );
  });

  it('applies the options to a queue that already exists, via updateQueue after createQueue', async () => {
    // createQueue() is a no-op for an existing queue, so without updateQueue() a
    // queue made by an earlier release would keep its old 7-day window forever.
    const mod = await load();
    await mod.startEmailQueue();
    expect(updateQueue).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({ deleteAfterSeconds: 86400, retryLimit: 5 })
    );
    expect(createQueue.mock.invocationCallOrder[0]).toBeLessThan(
      updateQueue.mock.invocationCallOrder[0]
    );
  });

  it('keeps delivering and logs loudly if updateQueue fails, instead of disabling the queue', async () => {
    updateQueue.mockRejectedValueOnce(new Error('permission denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await load();
    const result = await mod.startEmailQueue();
    expect(result).not.toBeNull();
    expect(mod.isEmailQueueDisabled()).toBe(false);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/Could not apply queue options/);
    errorSpy.mockRestore();
  });

  it('does not let pg-boss create the schema', async () => {
    // Managed Postgres roles often lack CREATE SCHEMA; migration 023 creates
    // the schema instead, and granting that to pg-boss would risk a boot
    // failure.
    const mod = await load();
    await mod.startEmailQueue();
    expect(constructorArgs[0].createSchema).toBe(false);
    expect(constructorArgs[0].schema).toBe('pgboss');
  });

  it('enqueues with kind and payload', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    send.mockResolvedValue('job-1');
    const id = await mod.enqueueEmail('verification', { email: 'a@b.c', link: 'https://x/y' });
    expect(id).toBe('job-1');
    expect(send).toHaveBeenCalledWith('email', {
      kind: 'verification',
      payload: { email: 'a@b.c', link: 'https://x/y' },
    });
  });

  it('rethrows from the worker so pg-boss can retry', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    let handler;
    work.mockImplementation(async (queue, opts, fn) => {
      handler = fn;
      return 'w';
    });
    const sender = vi.fn().mockRejectedValue(new Error('resend 500'));
    await mod.registerEmailWorker({ verification: sender });

    // pg-boss only counts a failed attempt if the handler throws.
    await expect(
      handler([{ id: 'j1', retryCount: 0, data: { kind: 'verification', payload: {} } }])
    ).rejects.toThrow('resend 500');
    expect(sender).toHaveBeenCalled();
  });

  it('handles a single-job argument as well as a batch array', async () => {
    // Defensive: if pg-boss ever hands over a bare job, destructuring it as an
    // array would throw on every send and burn all five retries.
    const mod = await load();
    await mod.startEmailQueue();
    let handler;
    work.mockImplementation(async (queue, opts, fn) => {
      handler = fn;
      return 'w';
    });
    const sender = vi.fn().mockResolvedValue(undefined);
    await mod.registerEmailWorker({ verification: sender });

    await handler({
      id: 'j2',
      retryCount: 0,
      data: { kind: 'verification', payload: { email: 'a@b.c' } },
    });
    expect(sender).toHaveBeenCalledWith({ email: 'a@b.c' });
  });

  it('does not retry an unknown email kind', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    let handler;
    work.mockImplementation(async (queue, opts, fn) => {
      handler = fn;
      return 'w';
    });
    const sender = vi.fn();
    await mod.registerEmailWorker({ verification: sender });

    // Retrying an unknown kind can never succeed, so it must not throw —
    // otherwise it burns all 5 attempts for nothing.
    await handler([{ id: 'j1', retryCount: 0, data: { kind: 'nope', payload: {} } }]);
    expect(sender).not.toHaveBeenCalled();
  });

  it('resolves a successful send', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    let handler;
    work.mockImplementation(async (queue, opts, fn) => {
      handler = fn;
      return 'w';
    });
    const sender = vi.fn().mockResolvedValue(undefined);
    await mod.registerEmailWorker({ verification: sender });
    await expect(
      handler([
        { id: 'j1', retryCount: 0, data: { kind: 'verification', payload: { email: 'a@b.c' } } },
      ])
    ).resolves.toBeUndefined();
  });

  it('falls back to sending in-process when enqueue fails', async () => {
    const mod = await load();
    await mod.startEmailQueue();
    send.mockRejectedValue(new Error('queue exploded'));
    const fallback = vi.fn().mockResolvedValue(undefined);

    const id = await mod.enqueueEmail('verification', { email: 'a@b.c' }, { fallback });

    // A failed enqueue must not lose the email.
    expect(fallback).toHaveBeenCalled();
    expect(id).toBeNull();
  });

  it('falls back when the queue never started', async () => {
    const mod = await load();
    // No startEmailQueue() call: simulate a boot where the queue failed.
    const fallback = vi.fn().mockResolvedValue(undefined);
    const id = await mod.enqueueEmail('verification', { email: 'a@b.c' }, { fallback });
    expect(fallback).toHaveBeenCalled();
    expect(id).toBeNull();
  });

  it('disables itself when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    const mod = await load();
    const result = await mod.startEmailQueue();
    expect(result).toBeNull();
    expect(mod.isEmailQueueDisabled()).toBe(true);
  });

  it('degrades to disabled rather than throwing when the queue cannot start', async () => {
    // A queue outage must not stop the API from serving requests.
    const mod = await load();
    start.mockRejectedValue(new Error('no pgboss schema'));
    const result = await mod.startEmailQueue();
    expect(result).toBeNull();
    expect(mod.isEmailQueueDisabled()).toBe(true);

    const fallback = vi.fn().mockResolvedValue(undefined);
    await mod.enqueueEmail('verification', { email: 'a@b.c' }, { fallback });
    expect(fallback).toHaveBeenCalled();
  });
});
