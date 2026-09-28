// backend/src/routes/health.js
// Cached health check — prevents DB DoS from aggressive polling
// while still surfacing actual outages within ~5 seconds.

import { Router } from 'express';
import db from '../db.js'; // FIX C8: db exports a query() method, not pool

const router = Router();

// In-memory cache: { healthy: boolean, expiresAt: number }
let cache = { healthy: true, expiresAt: 0 };
const CACHE_TTL_MS = 5000;

async function checkDb() {
  const now = Date.now();
  if (now < cache.expiresAt) {
    return cache.healthy;
  }
  try {
    await db.query('SELECT 1');
    cache = { healthy: true, expiresAt: now + CACHE_TTL_MS };
    return true;
  } catch {
    // The error is intentionally not inspected: /api/health reports reachability
    // as a boolean, and the query failure is logged by the db layer already.
    // Using an optional catch binding keeps it explicit that this is deliberate.
    cache = { healthy: false, expiresAt: now + CACHE_TTL_MS };
    return false;
  }
}

// FIX C9: use /health path so mounting at /api gives /api/health
router.get('/health', async (_req, res) => {
  const dbHealthy = await checkDb();
  if (!dbHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      db: 'down',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({
    status: 'healthy',
    db: 'up',
    timestamp: new Date().toISOString(),
  });
});

export default router;
