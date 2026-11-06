-- Migration: 031_add_mfa_replay_step.sql
--
-- TOTP codes are valid for a +/-1 step window (about 90 seconds), so a code
-- captured from a login request could be replayed within that window. Store
-- the highest time-step successfully consumed for each admin; verification
-- accepts only steps strictly greater than this value.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT;
