-- Migration 024: Durable Shield counters
--
-- Replaces the in-process Maps in shield/bruteForceGuard.js. Those counters
-- reset on every deploy and restart, and were invisible to every other
-- instance, so a restart mid-attempt handed an attacker a fresh 5-strike
-- budget, and a multi-instance deploy let one attacker exceed the aggregate
-- limit N-fold simply by spreading requests across instances. Postgres was
-- already a hard dependency for auth, the blocklist and every rate limit
-- elsewhere in this app, so the counters join it rather than adding Redis.
--
-- Bucket-based rather than a row per event: the old code kept an array of
-- timestamps per key, and a row-per-event design would mean a write on every
-- single request for the life of the deployment. Instead each (key, bucket)
-- pair is one row holding a count, so a key costs O(1) rows no matter how
-- much traffic it sees, and the rolling-window count is a SUM over the
-- buckets still inside the window.
--
-- BUCKET_SECONDS is fixed at 60s for every counter class rather than
-- tracking each class's own window length. A 5-minute brute-force window is
-- then 5 buckets and a 1-minute rate window is exactly 1, so a coarser
-- bucket can only ever make the window slightly wider than intended — it
-- over-counts by at most one bucket. Narrower is the safe direction to be
-- wrong in for a rate limiter's block threshold, so the trade is deliberate.
CREATE TABLE IF NOT EXISTS shield_counters (
  -- The counting identity, not necessarily an IP: for authenticated traffic
  -- this is "admin:42" / "client:7", so several users behind one office NAT
  -- are counted separately. Blocked IPs live in blocked_ips, keyed by the
  -- real IP — see bruteForceGuard.js for how the two relate.
  counter_key VARCHAR(255) NOT NULL,
  -- Which counter class this row belongs to. Without it, a single key could
  -- be hit by both the failed-login and the request-volume path and the two
  -- would share one total, letting a burst of either mask the other.
  metric VARCHAR(32) NOT NULL,
  -- start of the 60s bucket, truncated server-side from NOW() so instances
  -- with skewed clocks still land in the same bucket.
  bucket_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (metric, counter_key, bucket_start)
);

-- Drives the rolling-window SUM (WHERE bucket_start > now() - window).
CREATE INDEX IF NOT EXISTS idx_shield_counters_window ON shield_counters (metric, bucket_start);

-- Drives the expiry sweep. Plain (not partial) for the same reason migration
-- 011 spells out: Postgres requires index predicates to be IMMUTABLE, and
-- NOW() is not, so a `WHERE bucket_start < NOW() - interval ...` partial index
-- is rejected outright. The sweep is a daily job against a table with one
-- short-lived row per active key, so a full index scan is cheap here.
CREATE INDEX IF NOT EXISTS idx_shield_counters_sweep ON shield_counters (bucket_start);
