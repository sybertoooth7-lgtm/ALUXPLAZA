-- Migration 025: False-positive feedback for Shield blocks
--
-- An admin unblocking an IP is the only trustworthy ground truth this system
-- ever gets about whether a detection was wrong. Today that judgement is
-- thrown away the moment the block expires: blocked_ips holds one row per IP
-- (UNIQUE on ip_address, migration 011) and blockIp() overwrites `reason` and
-- `severity` on every re-block, so a signature that misfires fifty times
-- leaves exactly the same trace as one that misfired once. Nothing
-- accumulates, so there is no way to answer the one question that would
-- actually improve tuning: which signature produces the most false positives?
--
-- Two tables, because the two halves have different shapes.
--
-- shield_signature_stats is a per-signature counter pair. It exists so a false
-- positive count has a denominator: "14 unblocks" means nothing on its own, but
-- "14 unblocks out of 20 blocks" is a signature that is wrong 70% of the time
-- and should be retuned or narrowed. The denominator cannot come from
-- blocked_ips for the reason above — the row is overwritten every re-block, so
-- by the time anyone looks, the block count reflects only the last trip.
--
-- shield_unblock_feedback is the append-only event log. Keeping every unblock
-- (rather than only a per-IP count) is what makes the per-IP repetition signal
-- possible: three unblocks of the same address is usually a misfiring signature
-- or an over-tight threshold, not three separate attacks, and that address
-- deserves a look before it is blocked a fourth time.
--
-- Deliberately NOT used to auto-tune thresholds. Adjusting a security
-- threshold from admin clicks would let anyone with a session learn to
-- disable a detection by unblocking repeatedly, and would silently widen a
-- protection the first time an impatient admin clicked through a real alert.
-- The output is a report a human reads; the decision stays human.
CREATE TABLE IF NOT EXISTS shield_signature_stats (
  -- Stable identity of the thing that fired. Not the free-text `reason`:
  -- the rate-limit call sites embed live counts ("5 failed login attempts in
  -- 5min"), so the same attack would produce a different key on every trip and
  -- its history would never aggregate. Call sites pass an explicit key; see
  -- signatureKey() in shield/blocklist.js.
  signature_key VARCHAR(255) PRIMARY KEY,
  -- Denominator: how many times this signature ever blocked someone.
  block_count INTEGER NOT NULL DEFAULT 0,
  -- Numerator: how many of those blocks an admin reversed as a false positive.
  false_positive_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives the "which signature is worst" report, which is a full-table read of
-- a table bounded by the number of distinct signatures in the codebase.
-- The partial index carries the block count so Postgres can filter the
-- low-traffic keys the report deliberately ignores without sorting all of them.
CREATE INDEX IF NOT EXISTS idx_shield_signature_stats_blocks
  ON shield_signature_stats (block_count DESC)
  WHERE block_count > 0;

CREATE TABLE IF NOT EXISTS shield_unblock_feedback (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  -- The signature that caused the block being reversed. Denormalised from the
  -- block row rather than joined, because blockIp() has since overwritten that
  -- row by the time an admin looks at the block list, and the whole point is to
  -- preserve what was true when the block was made. NULL if the block had
  -- already expired or predates this table.
  signature_key VARCHAR(255),
  severity VARCHAR(20),
  auto_blocked BOOLEAN,
  -- Who reversed it. Enforced NOT NULL with a sentinel rather than left
  -- nullable: a feedback row nobody is accountable for is a row that will be
  -- ignored during tuning, which defeats the purpose of collecting it.
  admin_email VARCHAR(255) NOT NULL,
  -- Optional free text: "legitimate monitoring scanner", "shared office NAT".
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives the repeat-unblock report: "which addresses keep getting reversed",
-- grouped per IP. Plain index rather than partial for the same reason migration
-- 011 gives — a NOW() predicate is rejected by Postgres as non-IMMUTABLE, and
-- this table is small and append-only.
CREATE INDEX IF NOT EXISTS idx_shield_unblock_feedback_ip
  ON shield_unblock_feedback (ip_address);

-- Drives grouping feedback by signature.
CREATE INDEX IF NOT EXISTS idx_shield_unblock_feedback_signature
  ON shield_unblock_feedback (signature_key);
