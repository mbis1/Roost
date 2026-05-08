-- Roost: keep-alive table.
-- Run once in Supabase SQL Editor. Idempotent.
--
-- Used by /api/keepalive (Vercel daily cron) to keep Supabase free-tier
-- from pausing the project after 7 days of inactivity. The endpoint
-- writes one row per ping and prunes anything older than 30 days.

CREATE TABLE IF NOT EXISTS keepalive_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pinged_at timestamptz DEFAULT now(),
  source text DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_keepalive_log_pinged_at
  ON keepalive_log(pinged_at DESC);

ALTER TABLE keepalive_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_users_all_access ON keepalive_log;
CREATE POLICY authenticated_users_all_access
  ON keepalive_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
