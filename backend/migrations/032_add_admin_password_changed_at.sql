-- Migration: 032_add_admin_password_changed_at.sql
--
-- Admin accounts are created with a temporary password that the superadmin
-- chooses (and therefore knows) and, until now, there was no way to change
-- it. Store when the password last changed so middleware/auth.js can reject
-- sessions minted before that moment: a password change now ends every other
-- session for the account instead of letting an old cookie outlive it.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
