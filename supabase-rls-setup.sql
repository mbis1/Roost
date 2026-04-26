-- Roost: Row-Level Security migration.
-- Run this once in Supabase SQL Editor.
-- Idempotent — safe to re-run; uses IF EXISTS / DROP POLICY IF EXISTS guards.
--
-- Effect:
--   - Anonymous requests (anon key alone, no auth token): blocked.
--   - Authenticated requests (logged-in user, anon key + JWT): full access.
--   - Server-side requests using SUPABASE_SERVICE_ROLE_KEY: bypass RLS by design.
--
-- Resolves Supabase advisor warning "rls_disabled_in_public".
--
-- Going-forward rule: every new table added in a future sprint should
-- repeat this pattern (ENABLE RLS + CREATE POLICY authenticated_users_all_access).

-- ------------------------------------------------------------------
-- Helper: enable RLS + (re)create the authenticated-all-access policy
-- ------------------------------------------------------------------
-- Each block is wrapped in DO so a missing table doesn't abort the whole script.

DO $$
DECLARE
  tbl text;
  -- Every public table that the app talks to. Add new tables here as
  -- they're introduced.
  table_list text[] := ARRAY[
    'properties',
    'property_details',
    'property_rules',
    'listing_settings',
    'calendar_feeds',
    'messages',
    'message_threads',
    'vendors',
    'tasks',
    'emails',
    'user_settings',
    'booking_history',
    'competitor_listings',
    'seasonal_rules',
    'price_recommendations',
    'property_workflows'
  ];
BEGIN
  FOREACH tbl IN ARRAY table_list LOOP
    -- Skip if the table doesn't exist yet (migrations run independently).
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format(
        'DROP POLICY IF EXISTS authenticated_users_all_access ON public.%I',
        tbl
      );
      EXECUTE format(
        'CREATE POLICY authenticated_users_all_access ON public.%I '
        || 'FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        tbl
      );
      RAISE NOTICE 'RLS + policy applied to: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not present): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- Safety net: catch any other public tables we forgot to list above.
-- Applies the same policy. Skips supabase-internal schemas.
-- ------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'properties','property_details','property_rules','listing_settings',
        'calendar_feeds','messages','message_threads','vendors','tasks',
        'emails','user_settings','booking_history','competitor_listings',
        'seasonal_rules','price_recommendations','property_workflows'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'DROP POLICY IF EXISTS authenticated_users_all_access ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY authenticated_users_all_access ON public.%I '
      || 'FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
    RAISE NOTICE 'RLS + policy applied to (safety net): %', tbl;
  END LOOP;
END $$;
