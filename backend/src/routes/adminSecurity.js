// routes/adminSecurity.js
// Mount this under your existing admin auth middleware — same pattern
// you're presumably already using to protect other admin routes.
//
// Usage in your main app file:
//   import adminSecurityRoutes from './routes/adminSecurity.js';
//   app.use('/admin/security', requireAdminAuth, adminSecurityRoutes);

import { Router } from 'express';
import {
  listActiveBlocks,
  countActiveBlocks,
  unblockIp,
  getFalsePositiveReport,
  getRepeatOffenders,
} from '../shield/blocklist.js';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

/**
 * GET /admin/security/blocks?page=1&limit=50
 * Lists all currently active (non-expired) IP blocks.
 */
router.get('/blocks', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  try {
    const total = await countActiveBlocks();
    const blocks = await listActiveBlocks(limit, offset);
    res.json({
      blocks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin/security] failed to list blocks:', err.message);
    res.status(500).json({ error: 'Failed to fetch blocks.' });
  }
});

/**
 * POST /admin/security/blocks/:ip/unblock
 * Manually unblocks an IP — use this to clear a false positive.
 */
router.post('/blocks/:ip/unblock', async (req, res) => {
  try {
    // An unblock is the only ground truth this system gets about whether a
    // detection was wrong, so who did it and why is captured here rather than
    // left in the discarded block row. The note is what makes the feedback
    // actionable later: "shared office NAT" and "attacker, re-blocked" point
    // at opposite responses, and a bare "false positive" does not.
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : null;

    await unblockIp(req.params.ip, {
      adminEmail: req.user?.email || 'unknown',
      note: note || null,
    });
    await recordAuditLog({
      adminEmail: req.user?.email || 'unknown',
      action: 'ip.unblock',
      targetTable: 'blocked_ips',
      targetId: req.params.ip,
      oldValue: { blocked: true },
      newValue: { blocked: false, note: note || null },
    });
    res.json({ success: true, message: `${req.params.ip} unblocked.` });
  } catch (err) {
    console.error('[admin/security] failed to unblock:', err.message);
    res.status(500).json({ error: 'Failed to unblock IP.' });
  }
});

/**
 * GET /admin/security/feedback?minBlocks=5&minUnblocks=2
 *
 * Where the recorded unblocks come back out as something actionable: which
 * signatures actually produce false positives, and which addresses keep
 * getting reversed.
 *
 * A report, not an auto-tuner. Thresholds are deliberately not adjusted from
 * these numbers: doing so would let anyone holding an admin session weaken a
 * detection by unblocking it repeatedly, and would quietly widen a real
 * protection the first time someone clicked through an alert they did not read.
 * The aggregation is the input to a human decision.
 */
router.get('/feedback', async (req, res) => {
  const minBlocks = Math.max(parseInt(req.query.minBlocks, 10) || 5, 1);
  const minUnblocks = Math.max(parseInt(req.query.minUnblocks, 10) || 2, 1);

  try {
    const [signatures, repeatOffenders] = await Promise.all([
      getFalsePositiveReport({ minBlocks }),
      getRepeatOffenders({ minUnblocks }),
    ]);
    res.json({
      signatures,
      repeatOffenders,
      thresholds: { minBlocks, minUnblocks },
    });
  } catch (err) {
    console.error('[admin/security] failed to build feedback report:', err.message);
    res.status(500).json({ error: 'Failed to fetch feedback report.' });
  }
});

/**
 * GET /admin/security/events?page=1&limit=50&type=sqli
 * Recent security events (detections + blocks), most recent first.
 * Useful for reviewing what tripped a block before deciding to unblock.
 */
router.get('/events', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;
  const type = req.query.type || null;

  try {
    const whereClause = type ? 'WHERE event_type = $1' : '';
    const countParams = type ? [type] : [];
    const countResult = await db.query(
      `SELECT COUNT(*) FROM security_events ${whereClause}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = type ? [type, limit, offset] : [limit, offset];
    const limitPlaceholder = type ? '$2' : '$1';
    const offsetPlaceholder = type ? '$3' : '$2';
    const result = await db.query(
      `SELECT * FROM security_events ${whereClause}
       ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      dataParams
    );
    res.json({
      events: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin/security] failed to fetch events:', err.message);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

export default router;
