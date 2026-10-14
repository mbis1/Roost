-- supabase-email-alerts-setup.sql
--
-- Email alerts (2026-10-13): when an email from a watched sender lands in
-- the inbox, Roost texts Milo on Telegram with the message and an
-- AI-drafted reply. Safe to re-run.
--
--   email_watches  who to watch (address and/or names), linked property
--   email_alerts   one row per alert sent (dedupe + button callbacks)
--
-- Run after supabase-emails-setup.sql and supabase-property-hub-setup.sql.

create table if not exists email_watches (
  id uuid primary key default gen_random_uuid(),
  label text not null,                       -- shown in the Telegram ping
  match_from text not null default '',        -- comma list: full addresses or @domains
  match_names text not null default '',       -- comma list: names to find in sender name / subject / body
  property_id uuid references properties(id) on delete set null,
  context_notes text not null default '',     -- extra facts for the AI reply (lease, pets, etc.)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_alerts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  watch_id uuid references email_watches(id) on delete set null,
  draft_reply text not null default '',
  status text not null default 'sent',        -- sent | handled | failed
  telegram_message_id bigint,
  error text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create unique index if not exists email_alerts_email_unique on email_alerts(email_id);
create index if not exists email_alerts_created_idx on email_alerts(created_at desc);

-- Same posture as the other tables: server code uses the service role;
-- signed-in users get full access.
alter table email_watches enable row level security;
alter table email_alerts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'email_watches' and policyname = 'email_watches_authenticated_all') then
    create policy email_watches_authenticated_all on email_watches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'email_alerts' and policyname = 'email_alerts_authenticated_all') then
    create policy email_alerts_authenticated_all on email_alerts for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Seed: Jen Forman, Glenolden 12-month lease tenant. Emails Joanna at
-- anjeyka@yahoo.com; alerts go to Jacob's Telegram. Re-running updates it.
insert into email_watches (label, match_from, match_names, property_id, context_notes)
select 'Jen Forman (Glenolden lease)', 'jen@jenforman.com', 'Jen Forman, Jennifer Forman',
       (select id from properties where id = '86c49685-2b57-4d96-8131-a60773bc9d4c'), ''
where not exists (select 1 from email_watches where label like 'Jen Forman%');

update email_watches set
  label = 'Jen Forman (Glenolden lease)',
  match_from = 'jen@jenforman.com',
  match_names = 'Jen Forman, Jennifer Forman',
  property_id = (select id from properties where id = '86c49685-2b57-4d96-8131-a60773bc9d4c'),
  context_notes = $n$Jen Forman (jen@jenforman.com) and her family live at Glenolden on a 12-month lease, 2026-07-18 to about 2027-07-18 (booked through Airbnb, with a custom lease so her daughter could enroll in school). The family relocated from Texas; her daughter is in 8th grade at West Cary Middle School. They have one cat. Jen prefers email; she also has Joanna's phone number. Address her as Jen. She is a long-term tenant living there day to day, so treat requests as a landlord would: fix things promptly, send the right vendor, keep it friendly and simple.$n$,
  updated_at = now()
where label like 'Jen Forman%';
