-- Roost: Sprint B.2 — Workflow Compiler storage table.
-- Run this once in Supabase SQL Editor.
-- Idempotent — safe to re-run.
--
-- This table stores the compiled workflow diagram (output of
-- src/lib/workflow-compiler.ts) for each property. Recompiled whenever
-- settings change.

CREATE TABLE IF NOT EXISTS property_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  compiled_at timestamptz NOT NULL DEFAULT now(),
  source_settings_hash text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  overrides jsonb NOT NULL DEFAULT '{}',
  UNIQUE (property_id)
);

CREATE INDEX IF NOT EXISTS idx_property_workflows_property
  ON property_workflows(property_id);

-- RLS — see supabase-rls-setup.sql for the standing rule.
ALTER TABLE property_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_users_all_access ON property_workflows;
CREATE POLICY authenticated_users_all_access
  ON property_workflows
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
