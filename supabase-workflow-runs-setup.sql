-- Roost: Sprint B.4 — Workflow execution storage.
-- Run this once in Supabase SQL Editor. Idempotent.
--
-- Adds:
--   1. user_settings.telegram_bot_token, .telegram_chat_id  (config moves
--      from env vars into the row, so the user can swap bots from the UI
--      without redeploying)
--   2. workflow_runs table — one row per "Run step now" / scheduled
--      execution. Tracks the resolved template that was sent and whether
--      the user approved or rejected it from Telegram.

-- 1. user_settings: telegram config columns
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token text DEFAULT '';
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS telegram_chat_id text DEFAULT '';

-- 2. workflow_runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  action_index int NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'manual', -- 'manual' | 'cron' | 'event'
  channel text NOT NULL DEFAULT '',
  recipient text NOT NULL DEFAULT '',
  resolved_template text NOT NULL DEFAULT '',
  ai_refined_template text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  telegram_chat_id text NOT NULL DEFAULT '',
  telegram_message_id bigint,
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_property
  ON workflow_runs(property_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created
  ON workflow_runs(created_at DESC);

-- 3. RLS — same standing rule as every other table.
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_users_all_access ON workflow_runs;
CREATE POLICY authenticated_users_all_access
  ON workflow_runs
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
