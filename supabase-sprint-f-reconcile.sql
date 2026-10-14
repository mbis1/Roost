-- Roost: Sprint F schema reconciliation.
--
-- What this is:
--   Sprint F (booking event timeline + vendors v2) was applied by hand in
--   the Supabase SQL Editor and never saved to the repo, so a database
--   built from the supabase-*.sql files alone was missing objects the code
--   needs. This file was reconstructed from code usage (src/**) on
--   2026-10-13 and brings a database built from the existing files up to
--   what the app reads and writes.
--
-- Covers:
--   1. booking_events table (+ FKs, indexes, status check, RLS)
--   2. vendors: active, preferred_contact, rate_note, updated_at,
--      unique (name, role)  (property_ids uuid[] already exists in
--      supabase-schema.sql; re-asserted here for safety)
--   3. bookings.lifecycle_status (+ check)
--   4. price_recommendations unique (property_id, recommended_date), which
--      src/lib/pricing.ts upserts on
--
-- Safe to re-run, including on the live database that already has these
-- objects: everything is IF NOT EXISTS or guarded by a catalog check.
-- Nothing is dropped or rewritten. Check constraints are added NOT VALID
-- so existing rows are never rejected.
--
-- Run after supabase-bookings-pricing-setup.sql and before
-- supabase-rls-setup.sql.

-- ────────────────────────────────────────────────────────────────────
-- 1. booking_events
-- ────────────────────────────────────────────────────────────────────
-- One row per generated lifecycle step for a booking (src/lib/event-sync.ts).
-- step_id: WELCOME_MESSAGE | CLEANER_NOTIFY | CLEANER_ARRIVES |
--          LOCK_CODE_UPDATE | CHECKOUT_REMINDER | CONFIRM_TURNOVER
-- status:  pending | fired | completed | skipped | failed
-- source:  'auto' (generator); other values allowed

CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  property_id uuid NOT NULL,
  step_id text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at timestamptz,
  completed_at timestamptz,
  notes text,
  source text DEFAULT 'auto',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- In case the live table was created with fewer columns.
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS booking_id uuid;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS property_id uuid;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS step_id text;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS fired_at timestamptz;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS source text DEFAULT 'auto';
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Foreign keys (only if no FK on that column exists yet).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.booking_events'::regclass
      AND c.contype = 'f'
      AND a.attname = 'booking_id'
  ) THEN
    ALTER TABLE booking_events
      ADD CONSTRAINT booking_events_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.booking_events'::regclass
      AND c.contype = 'f'
      AND a.attname = 'property_id'
  ) THEN
    ALTER TABLE booking_events
      ADD CONSTRAINT booking_events_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Status check (NOT VALID: enforced for new writes, existing rows untouched).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_events'::regclass
      AND conname = 'booking_events_status_check'
  ) THEN
    ALTER TABLE booking_events
      ADD CONSTRAINT booking_events_status_check
      CHECK (status IN ('pending', 'fired', 'completed', 'skipped', 'failed'))
      NOT VALID;
  END IF;
END $$;

-- Cron (/api/workflow-tick): status = 'pending' AND scheduled_at <= now()
CREATE INDEX IF NOT EXISTS idx_booking_events_status_scheduled
  ON booking_events(status, scheduled_at);
-- Per-booking timeline + event-sync reconcile
CREATE INDEX IF NOT EXISTS idx_booking_events_booking
  ON booking_events(booking_id);
-- Property calendar window (property_id + scheduled_at range)
CREATE INDEX IF NOT EXISTS idx_booking_events_property_scheduled
  ON booking_events(property_id, scheduled_at);

ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_events'
      AND policyname = 'authenticated_users_all_access'
  ) THEN
    CREATE POLICY authenticated_users_all_access
      ON booking_events
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 2. vendors (Sprint F columns)
-- ────────────────────────────────────────────────────────────────────
-- role: lower-case slugs from VendorsView ROLE_OPTIONS ('cleaner', ...);
--       legacy VendorsTab still writes 'Cleaner'. No check added.
-- preferred_contact: sms | call | email | whatsapp (default 'sms')
-- property_ids: queried with .contains() (array containment)

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS property_ids uuid[] DEFAULT '{}';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferred_contact text DEFAULT 'sms';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rate_note text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- unique (name, role): skip if any unique index/constraint on exactly
-- (name, role) already exists, or if existing rows would violate it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.vendors'::regclass
      AND i.indisunique
      AND i.indnatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      ) = ARRAY['name', 'role']
  ) THEN
    RAISE NOTICE 'vendors unique (name, role) already present';
  ELSIF EXISTS (
    SELECT 1 FROM vendors GROUP BY name, role HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'vendors has duplicate (name, role) rows; unique index not created';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_role_key
      ON vendors(name, role);
  END IF;
END $$;

-- .contains('property_ids', [...]) + .eq('active', true) lookups
CREATE INDEX IF NOT EXISTS idx_vendors_property_ids
  ON vendors USING gin (property_ids);
CREATE INDEX IF NOT EXISTS idx_vendors_role_active
  ON vendors(role, active);

-- ────────────────────────────────────────────────────────────────────
-- 3. bookings.lifecycle_status
-- ────────────────────────────────────────────────────────────────────
-- Values from src/lib/booking-lifecycle.ts. The app currently computes
-- this on read (computeLifecycleStatus), so the column is nullable.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lifecycle_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'bookings_lifecycle_status_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_lifecycle_status_check
      CHECK (
        lifecycle_status IS NULL OR lifecycle_status IN (
          'upcoming', 'arriving_soon', 'in_stay', 'departing',
          'turnover', 'completed', 'cancelled'
        )
      )
      NOT VALID;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 4. price_recommendations unique (property_id, recommended_date)
-- ────────────────────────────────────────────────────────────────────
-- saveRecommendation() upserts with onConflict 'property_id,recommended_date',
-- which needs a unique index; supabase-schema.sql only has a plain one.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.price_recommendations'::regclass
      AND i.indisunique
      AND i.indnatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      ) = ARRAY['property_id', 'recommended_date']
  ) THEN
    RAISE NOTICE 'price_recommendations unique (property_id, recommended_date) already present';
  ELSIF EXISTS (
    SELECT 1 FROM price_recommendations
    GROUP BY property_id, recommended_date HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'price_recommendations has duplicate rows; unique index not created';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS price_recommendations_property_date_key
      ON price_recommendations(property_id, recommended_date);
  END IF;
END $$;
