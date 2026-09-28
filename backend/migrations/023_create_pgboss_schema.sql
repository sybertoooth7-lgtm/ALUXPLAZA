-- Create the pgboss schema for the durable email queue (lib/email-queue.js).
--
-- Done here rather than letting pg-boss do it because its `createSchema`
-- option needs CREATE SCHEMA on the database, which many managed Postgres
-- roles (Render's included) don't grant. The role only needs to own objects
-- inside the schema, which this does grant.
CREATE SCHEMA IF NOT EXISTS pgboss;

-- pg-boss creates and migrates its own tables inside the schema on start().
-- The GRANTs are the usual managed-provider requirement: without them the
-- app role can read the schema but not create its tables in it.
GRANT USAGE ON SCHEMA pgboss TO PUBLIC;
