import { PgBoss } from 'pg-boss';

/**
 * Durable email delivery on Postgres.
 *
 * Every send used to be fire-and-forget: `sendX().catch(console.error)`. That
 * means one Resend hiccup, one deploy, or one cold start silently loses a
 * verification or password-reset email, and the user has no way to tell the
 * difference between "no email sent" and "email sent". pg-boss gives us
 * retries with backoff, and a queryable table of what happened.
 *
 * The payload is a *description* of the email, not a rendered one, so the
 * sending code stays in email.js and the queue stays a transport detail.
 */

export const QUEUE_EMAIL = 'email';

// Retries are deliberate: a verification email that never arrives locks the
// user out of their own account. 5 attempts with exponential backoff spans
// roughly 1s -> 2s -> 4s -> 8s -> 16s, then gives up and the job lands in
// `failed` where it can be found and redriven.
const QUEUE_OPTIONS = {
  retryLimit: 5,
  retryDelay: 1,
  retryBackoff: true,
  retryDelayMax: 60,
  // A send that is still in flight after 5 minutes is presumed wedged.
  expireInSeconds: 300,
  // Keep completed jobs briefly for debugging, then let pg-boss reap them.
  retentionSeconds: 86400,
};

let boss = null;
let started = false;
let disabled = false;

export function isEmailQueueDisabled() {
  return disabled;
}

/**
 * Starts the queue. Safe to call once at boot; idempotent thereafter.
 *
 * Degrades to disabled rather than throwing: a failure to bring up the queue
 * must not stop the API from serving requests, or a queue problem becomes a
 * total outage. Sends then fall back to the old in-process path.
 */
export async function startEmailQueue() {
  if (boss || disabled) return boss;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    disabled = true;
    console.warn('[email-queue] DATABASE_URL not set — email queue disabled.');
    return null;
  }

  try {
    boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      // pg-boss owns the pgboss schema; letting it CREATE SCHEMA would need a
      // privilege many managed Postgres roles don't grant. A migration creates
      // the schema instead, and pg-boss creates its own tables inside it.
      createSchema: false,
    });
    boss.on('error', (err) => console.error('[email-queue] error:', err.message));
    await boss.start();
    await boss.createQueue(QUEUE_EMAIL, QUEUE_OPTIONS);
    started = true;
    console.log('[email-queue] Started.');
  } catch (err) {
    console.error(
      `[email-queue] FATAL: could not start (${err.message}). ` +
        'Falling back to in-process sending; emails will not be retried.'
    );
    boss = null;
    disabled = true;
    return null;
  }

  return boss;
}

/**
 * Registers the handler that actually sends queued mail.
 *
 * Handlers must THROW on failure — that is how pg-boss learns a send failed
 * and schedules a retry. email.js's senders swallow their own errors by design
 * (so their direct callers stay fire-and-forget), so this wrapper re-probes
 * the outcome rather than trusting the return value.
 */
export async function registerEmailWorker(senders) {
  if (!boss || !started) {
    console.warn('[email-queue] registerEmailWorker called before start; no worker registered.');
    return;
  }

  await boss.work(QUEUE_EMAIL, { batchSize: 1 }, async (arg) => {
    // Tolerant of both handler shapes. pg-boss documents a batch array, but
    // destructuring a single job object here would throw on every send and
    // quietly burn all five retries, which is the worst possible failure mode
    // for the one path that must not drop mail.
    const job = Array.isArray(arg) ? arg[0] : arg;
    if (!job) return;
    const { kind, payload } = job.data || {};
    const sender = senders[kind];
    if (!sender) {
      // Not retryable: retrying an unknown kind can never succeed.
      console.error(`[email-queue] unknown email kind "${kind}"; dropping job ${job.id}.`);
      return;
    }
    try {
      await sender(payload);
      console.log(`[email-queue] sent ${kind} (job ${job.id})`);
    } catch (err) {
      // Rethrow so pg-boss counts the attempt and retries.
      console.error(
        `[email-queue] ${kind} failed (job ${job.id}, attempt ${(job.retryCount ?? 0) + 1}/${QUEUE_OPTIONS.retryLimit}): ${err.message}`
      );
      throw err;
    }
  });

  console.log(`[email-queue] Worker registered on queue "${QUEUE_EMAIL}".`);
}

/**
 * Enqueues an email. Returns the job id, or null if the queue is unavailable.
 *
 * Falls back to sending in-process when the queue is down, so a queue outage
 * degrades to today's behaviour rather than dropping mail entirely.
 */
export async function enqueueEmail(kind, payload, { fallback } = {}) {
  if (!boss || !started) {
    if (fallback) {
      try {
        await fallback();
        return null;
      } catch (err) {
        console.error(`[email-queue] fallback ${kind} failed:`, err.message);
        return null;
      }
    }
    return null;
  }

  try {
    return await boss.send(QUEUE_EMAIL, { kind, payload });
  } catch (err) {
    console.error(`[email-queue] could not enqueue ${kind}: ${err.message}`);
    // A failed enqueue must not lose the email, so send it directly and let
    // the caller's logging cover it.
    if (fallback) {
      try {
        await fallback();
      } catch (fbErr) {
        console.error(`[email-queue] fallback ${kind} failed:`, fbErr.message);
      }
    }
    return null;
  }
}

export async function stopEmailQueue() {
  if (!boss) return;
  try {
    await boss.stop();
    console.log('[email-queue] Stopped.');
  } catch (err) {
    console.error('[email-queue] error on stop:', err.message);
  }
  boss = null;
  started = false;
}

/** Exposed for diagnostics and tests. */
export function getQueueStats() {
  return boss ? boss.getQueueStats(QUEUE_EMAIL) : null;
}
