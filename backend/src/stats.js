import db from './db.js';

const MAX_LATENCY_SAMPLES = 200;
const PERSISTED_KEYS = [
  'requestCount',
  'errorCount',
  'contactAttempts',
  'contactSuccesses',
  'honeypotBlocked',
];

async function loadPersistedValue(key) {
  try {
    const result = await db.query('SELECT value FROM metrics WHERE key = $1', [key]);
    return result.rows[0] ? parseInt(result.rows[0].value, 10) : 0;
  } catch (err) {
    console.error(`[stats] Failed to load '${key}':`, err.message);
    return 0;
  }
}

export const stats = {
  serverStartTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  latencies: [],
  contactAttempts: 0,
  contactSuccesses: 0,
  honeypotBlocked: 0,
};

// Tracks how much each counter has grown *since the last successful flush*,
// per worker process. Under CLUSTER_MODE, every worker has its own copy of
// `stats` — persisting the absolute value on each flush would mean whichever
// worker's timer fires last silently overwrites the others' counts.
// Persisting the delta instead means every worker's contribution adds up
// correctly in the database, regardless of how many workers are running.
const pendingDelta = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, 0]));
let dirty = false;

export async function loadPersistedValues() {
  for (const key of PERSISTED_KEYS) {
    stats[key] = await loadPersistedValue(key);
  }
  console.log(
    `[stats] Loaded persisted totals: requestCount=${stats.requestCount}, contactAttempts=${stats.contactAttempts}`
  );
}

export async function persistStats() {
  if (!dirty) return;
  const deltas = { ...pendingDelta };
  try {
    await db.transaction(async (client) => {
      for (const key of PERSISTED_KEYS) {
        if (!deltas[key]) continue;
        await client.query(
          `INSERT INTO metrics (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = metrics.value + EXCLUDED.value`,
          [key, deltas[key]]
        );
      }
    });
    for (const key of PERSISTED_KEYS) pendingDelta[key] -= deltas[key];
    dirty = false;
  } catch (err) {
    console.error('[stats] Failed to persist:', err.message);
    // Leave pendingDelta/dirty as-is so the next flush retries these deltas.
  }
}

// Cross-worker cumulative totals, read straight from the database. Any one
// worker's in-memory `stats` object only reflects the traffic it personally
// handled, so the public status endpoint uses this — not `stats` directly —
// for counters meant to represent the whole cluster.
export async function getPersistedTotals() {
  const result = await db.query(`SELECT key, value FROM metrics WHERE key = ANY($1)`, [
    PERSISTED_KEYS,
  ]);
  const totals = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, 0]));
  for (const row of result.rows) {
    totals[row.key] = parseInt(row.value, 10);
  }
  return totals;
}

export function recordRequest(latencyMs, isError) {
  stats.requestCount += 1;
  pendingDelta.requestCount += 1;
  if (isError) {
    stats.errorCount += 1;
    pendingDelta.errorCount += 1;
  }
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) stats.latencies.shift();
  dirty = true;
}

export function recordContactAttempt() {
  stats.contactAttempts += 1;
  pendingDelta.contactAttempts += 1;
  dirty = true;
}

export function recordContactSuccess() {
  stats.contactSuccesses += 1;
  pendingDelta.contactSuccesses += 1;
  dirty = true;
}

export function recordHoneypotBlocked() {
  stats.honeypotBlocked += 1;
  pendingDelta.honeypotBlocked += 1;
  dirty = true;
}

export function getUptimeSeconds() {
  return (Date.now() - stats.serverStartTime) / 1000;
}

export function getAverageLatencyMs() {
  if (stats.latencies.length === 0) return null;
  const sum = stats.latencies.reduce((a, b) => a + b, 0);
  return sum / stats.latencies.length;
}

export function getRequestsPerSecond() {
  const uptime = getUptimeSeconds();
  return uptime > 0 ? stats.requestCount / uptime : 0;
}

export function getAutoResponseRate() {
  if (stats.contactAttempts === 0) return null;
  return (stats.contactSuccesses / stats.contactAttempts) * 100;
}
