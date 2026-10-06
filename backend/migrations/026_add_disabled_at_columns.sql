-- Migration: 026_add_disabled_at_columns.sql
--
-- middleware/auth.js reads admin_users.disabled_at and middleware/clientAuth.js
-- reads clients.disabled_at on every authenticated request, but no earlier
-- migration ever created either column. On a database built purely from the
-- migration files, every authenticated request therefore fails with
-- 'column "disabled_at" does not exist'.
--
-- IF NOT EXISTS makes this a safe no-op on any database where the columns
-- were already added by hand.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
