import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { recordContactAttempt, recordContactSuccess, recordHoneypotBlocked } from '../stats.js';
import { sendContactNotification } from '../lib/email.js';
import { enqueueEmail } from '../lib/email-queue.js';
import { contactLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.post(
  '/',
  contactLimiter,
  [
    // No .escape() here on purpose: dashboard.js already HTML-escapes every
    // field at render time via its own escapeHtml()/textContent. Escaping
    // again here would double-encode stored data (e.g. "AT&T" becoming
    // "AT&amp;amp;T" permanently in the database) without adding any real
    // protection beyond what render-time escaping already provides.
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('email').trim().isEmail().normalizeEmail().isLength({ max: 255 }),
    body('company').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    body('message').trim().notEmpty().isLength({ max: 5000 }),
    body('honeypot').optional({ checkFalsy: true }).trim(),
    body('website_url').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    recordContactAttempt();

    // Honeypot checks: silent success to avoid leaking detection logic to bots
    if (req.body.honeypot || (req.body.website_url && req.body.website_url.trim().length > 0)) {
      recordHoneypotBlocked();
      return res.status(200).json({ success: true });
    }

    const { name, email, company, message } = req.body;

    // No sanitization step here on purpose: express-validator already
    // trims these fields above, and dashboard.js HTML-escapes every field
    // at render time (see the .escape() comment above). Server-side
    // DOMPurify (via JSDOM) added no real protection on top of that and
    // is unreliable outside a real browser DOM — removed.
    try {
      const result = await db.query(
        `INSERT INTO contacts (name, email, company, message, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'new', NOW(), NOW())
         RETURNING id`,
        [name, email, company || null, message]
      );

      recordContactSuccess();

      enqueueEmail(
        'contact-notification',
        { name, company, email, message, id: result.rows[0].id },
        {
          fallback: () =>
            sendContactNotification({ name, company, email, message, id: result.rows[0].id }),
        }
      ).catch((err) => {
        console.error('[email] Notification enqueue failed:', err.message);
      });

      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error('[contact] DB error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
