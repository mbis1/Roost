-- Roost: Sprint C.1 — email categorization storage.
-- Run once in Supabase SQL Editor. Idempotent.
--
-- Adds:
--   1. emails.ai_summary column (a one-line description from the AI fallback)
--   2. categorization_log table (one row per categorization decision,
--      including user overrides, so we can tune rules + prompt over time)

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS ai_summary text;

CREATE TABLE IF NOT EXISTS categorization_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  primary_tag text NOT NULL,
  secondary_tags text[] DEFAULT '{}',
  source text NOT NULL,             -- 'rule' | 'ai' | 'user_override'
  rule_id text,
  ai_summary text,
  user_overridden boolean DEFAULT false,
  user_override_to text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cat_log_email
  ON categorization_log(email_id);
CREATE INDEX IF NOT EXISTS idx_cat_log_overridden
  ON categorization_log(user_overridden) WHERE user_overridden = true;
CREATE INDEX IF NOT EXISTS idx_cat_log_created
  ON categorization_log(created_at DESC);

ALTER TABLE categorization_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_users_all_access ON categorization_log;
CREATE POLICY authenticated_users_all_access
  ON categorization_log
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
