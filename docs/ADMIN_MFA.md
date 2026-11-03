# Admin two-factor authentication (mandatory)

Every admin account must set up two-factor authentication (an authenticator
app) before it can use the admin area. This is **on by default**.

## How it behaves

- An admin who has not set it up can still sign in with a password, but that
  session can only reach the setup endpoints (`/api/admin/me`, `/logout`,
  `/mfa/status`, `/mfa/enroll`, `/mfa/verify-enrollment`). Every other admin
  endpoint answers `403` with `mfaEnrollmentRequired: true`.
- The front end sends them to `/admin/mfa-setup`. After they enter a valid
  code and save their backup codes, the same session works normally.
- The check reads `admin_users.mfa_enabled` on every request, so sessions
  issued before this was switched on are covered too.
- An admin who already has MFA cannot start a new enrolment (`409`) and cannot
  turn MFA off (`403`). This stops someone who steals a session cookie from
  swapping in their own authenticator.
- The QR code is drawn by the server. The secret is never sent to a
  third-party service.

## Setting

`ADMIN_MFA_REQUIRED` (backend environment variable).

- Unset or any value other than the exact text `false`: enforcement is **on**.
- `false`: enforcement is off. For local development only. In production the
  server prints a warning at start-up if it is set to `false`.

Do not add this variable on Render. Leaving it unset keeps it on.

## Rolling it out

1. Deploy. Existing admins are not locked out: their next request redirects
   them to the setup screen.
2. Sign in as the superadmin first and complete the setup. Save the backup
   codes somewhere that is not the same phone.
3. Ask every other admin to do the same.

## Lost phone and no backup codes

There is deliberately no self-service way to turn MFA off. A superadmin with
database access resets the account, and the admin sets it up again at next
sign-in:

```sql
UPDATE admin_users
   SET mfa_enabled = FALSE, mfa_secret = NULL,
       mfa_backup_codes = NULL, mfa_enrolled_at = NULL
 WHERE email = 'admin@example.com';
```

Record the reset in the audit log or incident notes. If the **only** superadmin
is locked out, this SQL (run from the Render or Neon console) is the only way
back in, so keep the backup codes safe.
