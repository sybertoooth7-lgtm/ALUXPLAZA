// routes/verifyScore.js
// Public, unauthenticated: anyone holding a valid token (a bank, insurer,
// partner the client shared the link with) can verify a score exists and
// see the score/label/company name/issue date — nothing else. No
// checklist detail, no framework breakdown, no client email. Mount at
// /api/verify with NO auth middleware.
import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import db from '../db.js';
import { computeRiskScore, scoreLabel } from '../shield/riskScore.js';

const router = Router();

router.get(
  '/:token',
  [param('token').isString().isLength({ min: 10, max: 64 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid verification link.' });
    }

    try {
      const shareResult = await db.query(
        `SELECT rss.client_id, rss.expires_at, rss.revoked_at, rss.created_at,
              c.company_name
       FROM risk_score_shares rss
       JOIN clients c ON c.id = rss.client_id
       WHERE rss.token = $1`,
        [req.params.token]
      );

      const share = shareResult.rows[0];
      if (!share) {
        return res.status(404).json({ error: 'This verification link is not valid.' });
      }
      if (share.revoked_at) {
        return res.status(410).json({ error: 'This verification link has been revoked.' });
      }
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).json({ error: 'This verification link has expired.' });
      }

      const { score } = await computeRiskScore(share.client_id);

      res.json({
        companyName: share.company_name,
        score,
        label: scoreLabel(score),
        issuedAt: share.created_at,
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'Alux Plaza',
      });
    } catch (err) {
      console.error('[verifyScore] Verification failed:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
