-- Migration: 030_backfill_risk_score_share_expiry.sql
--
-- Share links used to be inserted with expires_at = NULL, which verifyScore.js
-- treated as "never expires". That made every link a permanent bearer
-- credential. New links default to 30 days; this backfills existing rows to a
-- 90-day lifetime from creation, so old links older than that stop working.
UPDATE risk_score_shares
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL;
