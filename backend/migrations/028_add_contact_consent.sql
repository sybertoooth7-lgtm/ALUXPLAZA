-- Migration: 028_add_contact_consent.sql
--
-- Records when the sender agreed to the privacy notice shown beside the
-- contact form. NULL means the row was submitted before consent was captured
-- (all rows that exist when this migration runs), so legacy rows are
-- deliberately not back-filled with a consent that was never given.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
