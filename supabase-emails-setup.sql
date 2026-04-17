-- Roost Inbox: emails table + seed data
-- Run this in Supabase SQL Editor once.

create table if not exists emails (
  id uuid default uuid_generate_v4() primary key,
  from_addr text,
  from_name text,
  to_addr text,
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz,
  read boolean default false,
  primary_tag text,
  secondary_tags text[] default '{}',
  property_id uuid references properties(id) on delete set null,
  thread_id text,
  raw_uid text,
  created_at timestamptz default now()
);

alter table emails disable row level security;

create index if not exists idx_emails_received_at on emails(received_at desc);
create index if not exists idx_emails_primary_tag on emails(primary_tag);

-- Seed data: 15 realistic-looking fake emails across categories.
-- NOTE: no email is tagged as 'guest_message' on purpose. The Messages
-- tab filters for primary_tag='guest_message' so it stays empty until
-- the tagging pipeline is built. Inbox shows all of these.
insert into emails (from_addr, from_name, to_addr, subject, body_text, received_at, read, primary_tag, secondary_tags) values
  ('automated@airbnb.com', 'Airbnb', 'anjeyka@yahoo.com', 'Booking confirmed: 214 Spruce Pine Dr (Apr 22 – Apr 26)', 'Your reservation is confirmed. Guest: Marcus Taylor. Check-in: April 22, 2026. Check-out: April 26, 2026. Total payout: $612.40. Message the guest with check-in details when you are ready.', now() - interval '3 hours', false, 'booking', '{}'),
  ('noreply@vrbo.com', 'Vrbo', 'anjeyka@yahoo.com', 'New inquiry about your Lakeview Cabin', 'Hi Anjeyka, Sarah would like to know if your property allows small dogs. She is considering a stay May 10-14. Please respond within 24 hours to keep your response rate high.', now() - interval '6 hours', false, null, '{}'),
  ('reviews@airbnb.com', 'Airbnb', 'anjeyka@yahoo.com', 'You got a 5-star review from Jennifer K.', 'Jennifer wrote: "Beautiful property, immaculate cleanliness, and the host was incredibly responsive. We''ll definitely be back!" Average rating: 4.97.', now() - interval '14 hours', false, 'review', '{}'),
  ('payouts@airbnb.com', 'Airbnb Payouts', 'anjeyka@yahoo.com', 'Payout of $847.22 is on the way', 'Your payout of $847.22 for reservation #HMB2PY8R was sent to your bank account ending in •••4421 on April 17. Expect it to arrive in 1-3 business days.', now() - interval '1 day', true, 'payout', '{}'),
  ('billing@duke-energy.com', 'Duke Energy', 'anjeyka@yahoo.com', 'Your April bill is ready – $142.88 due May 2', 'Account: 214 Spruce Pine Dr. Usage this month: 1,240 kWh (up 8% vs last April). Payment due: May 2, 2026. Enroll in AutoPay to avoid late fees.', now() - interval '1 day 4 hours', false, 'bill', '{}'),
  ('receipts@homedepot.com', 'The Home Depot', 'anjeyka@yahoo.com', 'Your receipt from Store #6104', 'Thank you for your purchase! Items: Kwikset SmartKey deadbolt ($38.97), caulk gun ($12.47), 2-pack AAA batteries ($4.99). Total with tax: $60.28.', now() - interval '2 days', true, 'expense', '{}'),
  ('jennie@alottaproperties.com', 'Jennie (Alotta Properties)', 'anjeyka@yahoo.com', 'FW: WO #4897-1 – Clogged garbage disposal at Spruce Pine', 'Hi Anjeyka, forwarding the work order for the garbage disposal complaint. Vendor dispatch scheduled for tomorrow 9-11am. Cost estimate: $180.', now() - interval '2 days 8 hours', true, 'maintenance', '{}'),
  ('quotes@acehandymanservices.com', 'Ace Handyman Services', 'anjeyka@yahoo.com', 'Quote: screen door repair at 214 Spruce Pine Dr', 'Hello, as discussed on the phone, our quote for the screen door repair is $225 including parts and labor. Availability: Wed or Fri this week. Reply to schedule.', now() - interval '3 days', false, 'vendor', '{}'),
  ('kim@clean-sweep-llc.com', 'Kim – Clean Sweep LLC', 'anjeyka@yahoo.com', 'Cleaning schedule confirmation: April 19', 'Confirming cleaning between 11am and 2pm on April 19. Standard turnover package – $110. Reply if any changes needed.', now() - interval '3 days 4 hours', true, 'vendor', '{}'),
  ('no-reply@spectrum.net', 'Spectrum', 'anjeyka@yahoo.com', 'Your internet bill: $89.99 auto-paid', 'Your monthly Spectrum Internet bill of $89.99 was auto-paid to the Visa ending in •••4421 on April 15. Service address: 214 Spruce Pine Dr.', now() - interval '4 days', true, 'bill', '{}'),
  ('deals@marriott.com', 'Marriott Rewards', 'anjeyka@yahoo.com', 'Weekend getaway deals – up to 30% off', 'Escape this spring! Book now and save up to 30% on weekend stays at select Marriott properties. Hurry, offer ends April 24.', now() - interval '5 days', true, 'personal', '{}'),
  ('automated@airbnb.com', 'Airbnb', 'anjeyka@yahoo.com', 'Booking confirmed: Lakeview Cabin (May 3 – May 7)', 'Reservation confirmed. Guest: David Chen. Check-in: May 3, 2026. Check-out: May 7, 2026. Payout: $1,124.00.', now() - interval '6 days', true, 'booking', '{}'),
  ('inquiry@bookdirect.com', 'Casey M.', 'anjeyka@yahoo.com', 'Direct inquiry about 214 Spruce Pine weekend of May 24', 'Hi! Found your property via a friend. Would love to book May 24-27 for a family of 4. Is the pool open? Thanks, Casey', now() - interval '7 days', false, null, '{}'),
  ('billing@watercompany.com', 'City Water Utility', 'anjeyka@yahoo.com', 'Water bill – $64.12 due April 28', 'Your water and sewer bill for service at 214 Spruce Pine Dr is ready. Amount: $64.12. Due: April 28, 2026.', now() - interval '8 days', true, 'bill', '{}'),
  ('winner@sweepstakes.example', 'Sweepstakes Central', 'anjeyka@yahoo.com', 'Congratulations! You''ve been selected!', 'You are a pre-qualified recipient of our $500 gift card drawing. Click here to confirm your entry. *may be junk*', now() - interval '10 days', true, 'personal', '{}');
