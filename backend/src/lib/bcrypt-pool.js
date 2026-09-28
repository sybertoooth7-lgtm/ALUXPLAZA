import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * bcrypt off the event loop.
 *
 * `bcryptjs` is pure JS, so even its "async" API just yields to the event loop
 * between ~100ms CPU chunks — it still blocks. Measured at cost 12: ~806ms per
 * hash with a worst-case ~107ms single stall, and roughly 9 concurrent logins
 * enough to saturate the loop. On a 0.1-CPU instance that shows up as latency
 * spikes across every endpoint, not just login.
 *
 * Running the same pure-JS code in a worker thread moves that CPU off the main
 * thread. This deliberately does NOT switch to native `bcrypt`: that would add a
 * node-gyp build step to the Render deploy, which is a worse failure mode than
 * a latency bump. Hash output is byte-identical either way, so existing
 * password hashes stay valid.
 */

const WORKER_URL = new URL('./bcrypt-worker.js', import.meta.url);
const MAX_QUEUE = 32;

// Small by default: each worker is a whole bcryptjs instance in memory, and the
// target is a 0.1-CPU free-tier box where threads mostly contend for one core.
const POOL_SIZE = Math.max(
  1,
  Math.min(Number(process.env.BCRYPT_WORKERS) || Math.min(2, os.cpus().length), 4)
);

const workers = new Map(); // worker -> true while busy
let nextId = 1;
const queue = [];
const pending = new Map();

function spawnWorker() {
  const worker = new Worker(fileURLToPath(WORKER_URL));
  workers.set(worker, false);
  worker.on('message', ({ id, result, error }) => {
    const entry = pending.get(id);
    pending.delete(id);
    workers.set(worker, false);
    if (entry) {
      if (error) entry.reject(new Error(error));
      else entry.resolve(result);
    }
    dispatch();
    syncRefState();
  });
  worker.on('error', (err) => {
    // Fail everything this worker was holding, then drop it so a replacement
    // is spawned on the next request.
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
    workers.delete(worker);
    worker.terminate();
  });
  return worker;
}

// The event loop must stay alive while a job is outstanding, otherwise the
// process can exit before the worker replies and the promise never settles.
// Once everything is drained, unref so idle workers don't hold the process open.
function syncRefState() {
  const busy = pending.size > 0 || queue.length > 0;
  for (const worker of workers.keys()) {
    if (busy) worker.ref();
    else worker.unref();
  }
}

function dispatch() {
  while (queue.length) {
    let worker = null;
    for (const [w, busy] of workers) {
      if (!busy) {
        worker = w;
        break;
      }
    }
    if (!worker) {
      // Grow up to the pool cap, but never beyond it.
      if (workers.size < POOL_SIZE) {
        worker = spawnWorker();
      } else {
        return;
      }
    }
    const job = queue.shift();
    const id = nextId++;
    pending.set(id, job);
    workers.set(worker, true);
    worker.postMessage({ id, op: job.op, data: job.data, rounds: job.rounds, hash: job.hash });
  }
  syncRefState();
}

function enqueue(op, data, rounds, hash) {
  if (queue.length >= MAX_QUEUE) {
    return Promise.reject(new Error('bcrypt pool saturated: too many concurrent auth operations'));
  }
  return new Promise((resolve, reject) => {
    queue.push({ op, data, rounds, hash, resolve, reject });
    if (workers.size === 0) spawnWorker();
    dispatch();
  });
}

/** Hashes a password. Rejects if the pool is saturated rather than queueing forever. */
export function hash(data, rounds) {
  return enqueue('hash', data, rounds);
}

/** Compares a password to a hash. Same contract as bcrypt.compare. */
export function compare(data, hashValue) {
  return enqueue('compare', data, undefined, hashValue);
}

/** Releases workers so the process can exit promptly on shutdown. */
export async function shutdown() {
  const all = [...workers.keys()];
  workers.clear();
  await Promise.allSettled(all.map((w) => w.terminate()));
}
