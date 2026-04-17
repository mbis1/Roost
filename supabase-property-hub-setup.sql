-- Roost: Property Hub schema migration.
-- Run this once in Supabase SQL Editor before using the new Property Hub UI.
-- Safe to re-run — all changes are idempotent.

-- 1. Expand the properties table with richer columns.
alter table properties add column if not exists nickname text default '';
alter table properties add column if not exists city text default '';
alter table properties add column if not exists state text default '';
alter table properties add column if not exists zip text default '';
alter table properties add column if not exists bedrooms int default 0;
alter table properties add column if not exists bathrooms numeric(3,1) default 0;
alter table properties add column if not exists max_guests int default 0;
alter table properties add column if not exists property_type text default 'Other';
alter table properties add column if not exists primary_photo_url text default '';
alter table properties add column if not exists archived boolean default false;

-- 2. property_details: flexible per-card jsonb storage.
create table if not exists property_details (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  section text not null,
  data jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique (property_id, section)
);

create index if not exists idx_property_details_property on property_details(property_id);
create index if not exists idx_property_details_section on property_details(section);

alter table property_details disable row level security;

-- 3. emails gets a property_id foreign key (manual assignment today, AI later).
alter table emails add column if not exists property_id uuid references properties(id) on delete set null;
create index if not exists idx_emails_property on emails(property_id);

-- 4. For the Property Hub to render with RLS off like the rest of the app's tables.
alter table properties disable row level security;
