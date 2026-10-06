-- Migration: 029_add_client_consent.sql
--
-- Records when a client agreed to the Privacy Policy while creating their own
-- account through /api/client/signup. NULL means no consent was captured: the
-- account existed before this migration, or an admin created it on the
-- client's behalf (POST /api/admin/clients) rather than the client signing up.
-- Existing rows are deliberately not back-filled.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
