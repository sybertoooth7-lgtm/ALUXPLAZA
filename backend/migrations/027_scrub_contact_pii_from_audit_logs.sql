-- Migration: 027_scrub_contact_pii_from_audit_logs.sql
--
-- Before this change, deleting a contact submission wrote the whole deleted
-- row (name, email, company, message) into audit_logs.old_value, so the
-- "deleted" personal data was retained indefinitely. This rewrites those
-- existing 'submission.delete' entries to the same non-identifying summary
-- the route now writes: status, whether a company was given, and created_at.
--
-- Only rows that still contain the 'email' key are touched, so running this
-- again (or after the route fix) changes nothing.
UPDATE audit_logs
SET old_value = jsonb_build_object(
  'status', old_value->'status',
  'had_company', COALESCE(old_value->>'company', '') <> '',
  'created_at', old_value->'created_at'
)
WHERE action = 'submission.delete'
  AND old_value IS NOT NULL
  AND old_value ? 'email';
