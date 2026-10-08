// backend/src/routes/status.js
import { Router } from 'express';
import { stats } from '../stats.js';
import { getPersistedTotals } from '../stats.js'; // ADD THIS IMPORT

const router = Router();

function getUptimeSeconds() {
  return Math.floor((Date.now() - stats.serverStartTime) / 1000);
}

function getRequestsPerSecond() {
  const elapsed = (Date.now() - stats.serverStartTime) / 1000;
  return elapsed > 0 ? (stats.requestCount / elapsed).toFixed(2) : 0;
}

function getAverageLatencyMs() {
  if (stats.latencies.length === 0) return 0;
  const sum = stats.latencies.reduce((a, b) => a + b, 0);
  return (sum / stats.latencies.length).toFixed(2);
}

function getContactSuccessRate() {
  if (stats.contactAttempts === 0) return 0;
  return ((stats.contactSuccesses / stats.contactAttempts) * 100).toFixed(2);
}

// OLD endpoint (keep for backward compat)
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: getUptimeSeconds(),
    requestsPerSecond: getRequestsPerSecond(),
    averageLatencyMs: getAverageLatencyMs(),
    totalRequests: stats.requestCount,
    totalErrors: stats.errorCount,
    autoResponseRate: getContactSuccessRate(),
    honeypotBlocked: stats.honeypotBlocked,
    serverStartTime: stats.serverStartTime,
  });
});

// NEW endpoint — matches exactly what the frontend expects
router.get('/defense-matrix', async (req, res) => {
  const persisted = await getPersistedTotals().catch(() => ({}));

  res.json({
    requestCount: persisted.requestCount ?? stats.requestCount,
    errorCount: persisted.errorCount ?? stats.errorCount,
    averageLatencyMs: stats.latencies.length > 0 ? parseFloat(getAverageLatencyMs()) : null,
    requestsPerSecond: parseFloat(getRequestsPerSecond()),
    uptimeSeconds: getUptimeSeconds(),
    contactSuccessRate: stats.contactAttempts > 0 ? parseFloat(getContactSuccessRate()) : null,
    honeypotBlocked: persisted.honeypotBlocked ?? stats.honeypotBlocked,
  });
});

export default router;
