// routes/clientSecurityEvents.js
// Client-facing: view their own login attempt history. Mount under
// requireClientAuth at /api/client/security-events.
//
// IP addresses are partially masked before being returned — a client
// doesn't need the full IP to recognize "that wasn't me," and there's
// no reason to hand out full attacker IPs to every client account that
// gets probed (that data is still fully visible to admins via the
// existing /api/admin/security/events endpoint).
import { Router } from 'express';
import db from '../db.js';
import { parsePage, parseLimit } from '../lib/pagination.js';

const router = Router();

function maskIp(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`; // IPv4
  }
  // IPv6 or anything else: mask everything past the first segment
  const segments = ip.split(':');
  if (segments.length > 1) {
    return `${segments[0]}:x:x:x`;
  }
  return 'x.x.x.x';
}

router.get('/', async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;

  try {
    const countResult = await db.query(
      'SELECT COUNT(*) FROM client_login_attempts WHERE client_id = $1',
      [req.client.sub]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await db.query(
      `SELECT ip_address, success, created_at
       FROM client_login_attempts
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.client.sub, limit, offset]
    );

    const events = result.rows.map((row) => ({
      ipAddress: maskIp(row.ip_address),
      success: row.success,
      createdAt: row.created_at,
    }));

    // failedCount is scoped to this page's rows, same as before — a
    // full-history failed count would need a separate aggregate query.
    const failedCount = events.filter((e) => !e.success).length;

    res.json({ events, failedCount, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[clientSecurityEvents] Failed to fetch login history:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
