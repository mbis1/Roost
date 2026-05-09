-- Roost: Sprint E — Calendar + Pricing v1.
-- Run once in Supabase SQL Editor. Idempotent.
--
-- Adds:
--   1. properties.ical_feeds jsonb column (per-platform iCal feed config)
--   2. bookings table (one row per stay; iCal-sourced + email-enriched)
--   3. pricing_overrides table (per-day custom price)
--
-- All RLS-enabled with the standing authenticated_users_all_access policy.

-- 1. properties.ical_feeds
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS ical_feeds jsonb DEFAULT '[]'::jsonb;

-- Example value:
--   [{"platform":"airbnb","url":"https://...","last_synced_at":"2026-05-09T14:00:00Z"}]

-- 2. bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- iCal-sourced fields
  ical_uid text NOT NULL,            -- unique ID from the iCal feed
  source text NOT NULL,              -- 'airbnb' | 'vrbo' | 'booking' | 'manual'
  status text NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'blocked' | 'cancelled'
  checkin_date date NOT NULL,
  checkout_date date NOT NULL,
  summary text,                      -- raw iCal SUMMARY field

  -- Email-enriched fields (Sprint E.5 will fill these from booking emails)
  guest_name text,
  guest_phone text,
  guest_email text,
  total_paid numeric,
  host_payout numeric,
  cleaning_fee numeric,
  guests_count int,
  platform_booking_id text,          -- e.g. Airbnb's HMBMT4FBEA

  -- Workflow tracking (Sprint D will populate this)
  current_workflow_step text,

  -- Source tracking
  source_email_id uuid REFERENCES emails(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (property_id, ical_uid)
);

CREATE INDEX IF NOT EXISTS idx_bookings_property
  ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_checkin
  ON bookings(checkin_date);
CREATE INDEX IF NOT EXISTS idx_bookings_dates
  ON bookings(property_id, checkin_date, checkout_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON bookings(status);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_users_all_access ON bookings;
CREATE POLICY authenticated_users_all_access
  ON bookings
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. pricing_overrides
CREATE TABLE IF NOT EXISTS pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date date NOT NULL,
  price numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (property_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pricing_overrides_property_date
  ON pricing_overrides(property_id, date);

ALTER TABLE pricing_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_users_all_access ON pricing_overrides;
CREATE POLICY authenticated_users_all_access
  ON pricing_overrides
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────
-- Optional one-shot seed: pre-configure Glenolden's Airbnb iCal feed.
-- Verify the WHERE clause matches your Glenolden row before running.
-- Skip if you'd rather paste the feed URL through the UI.
-- ────────────────────────────────────────────────────────────────────
-- UPDATE properties
-- SET ical_feeds = '[{"platform":"airbnb","url":"https://www.airbnb.com/calendar/ical/809228673745540112.ics?t=a64ab88623d4456a92fdfd3c6acccbc0","last_synced_at":null}]'::jsonb
-- WHERE name ILIKE '%glenolden%' OR nickname ILIKE '%glenolden%';
