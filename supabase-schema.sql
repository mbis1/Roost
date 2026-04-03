create extension if not exists "uuid-ossp";

create table properties (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, address text default '', platforms text[] default '{"Airbnb"}',
  price_per_night numeric(10,2) default 0, cleaning_fee numeric(10,2) default 0,
  wifi_name text default '', wifi_password text default '', lock_code text default '',
  check_in_time text default '15:00', check_out_time text default '11:00',
  min_nights integer default 1, monthly_target numeric(10,2) default 0,
  rating numeric(3,2) default 0, reviews_count integer default 0,
  status text default 'listed' check (status in ('listed', 'unlisted', 'snoozed')),
  notes text default '', created_at timestamptz default now()
);

create table property_rules (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade unique,
  hoa_name text default '', max_guests integer default 0, quiet_hours text default '',
  parking_rules text default '', pet_policy text default '', smoking_policy text default '',
  trash_schedule text default '', pool_rules text default '', additional_rules text default '',
  check_in_instructions text default '', check_out_instructions text default ''
);

create table listing_settings (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade unique,
  title text default '', description text default '', cancellation_policy text default 'Moderate',
  instant_book boolean default true, self_check_in boolean default true,
  security_deposit numeric(10,2) default 0, extra_guest_fee numeric(10,2) default 0,
  extra_guest_after integer default 2, weekly_discount numeric(5,2) default 0,
  monthly_discount numeric(5,2) default 0, max_guests integer default 4,
  bedrooms integer default 1, bathrooms integer default 1, beds integer default 1,
  amenities text[] default '{}'
);

create table calendar_feeds (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade,
  platform text not null, ical_url text default '', last_synced_at timestamptz,
  created_at timestamptz default now()
);

create table messages (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade,
  guest_name text not null, platform text not null,
  status text default 'inquiry' check (status in ('inquiry', 'confirmed', 'review', 'expired', 'cancelled')),
  booking_dates text default '', unread boolean default true,
  last_message_preview text default '', last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

create table message_threads (
  id uuid default uuid_generate_v4() primary key,
  message_id uuid references messages(id) on delete cascade,
  sender text not null check (sender in ('guest', 'host', 'system', 'ai_draft')),
  text text not null, sent_at timestamptz default now(), approved boolean default false
);

create table vendors (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null, role text default 'Other', phone text default '', email text default '',
  rate text default '', property_ids uuid[] default '{}', rating integer default 3,
  notes text default '', created_at timestamptz default now()
);

create table tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  task text not null, type text default 'Other', due_date date not null,
  recurrence text default 'one-time' check (recurrence in ('one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'semi-annual', 'annual')),
  status text default 'upcoming' check (status in ('urgent', 'overdue', 'upcoming', 'done')),
  assigned_to text default '', cost numeric(10,2) default 0, notes text default '',
  last_completed_at timestamptz, created_at timestamptz default now()
);

create table user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  airbnb_host_fee_pct numeric(5,2) default 3.0, airbnb_guest_fee_pct numeric(5,2) default 14.2,
  vrbo_host_fee_pct numeric(5,2) default 5.0, vrbo_guest_fee_pct numeric(5,2) default 0,
  tax_rate numeric(5,2) default 0, phone text default '', email text default '',
  card_last4 text default '', auto_pay_vendors boolean default false,
  ai_provider text default 'huggingface', ai_api_key text default '', ai_tone text default 'friendly'
);

create table calc_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  platform text, nights integer, nightly_rate numeric(10,2), cleaning_fee numeric(10,2),
  discount_pct numeric(5,2), guest_total numeric(10,2), host_payout numeric(10,2),
  created_at timestamptz default now()
);

create table booking_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  platform text not null, guest_name text default '',
  check_in date not null, check_out date not null,
  nights integer generated always as (check_out - check_in) stored,
  nightly_rate numeric(10,2) not null, cleaning_fee numeric(10,2) default 0,
  extra_guest_fees numeric(10,2) default 0, discount_amount numeric(10,2) default 0,
  guest_paid numeric(10,2) default 0, host_payout numeric(10,2) default 0,
  platform_fees numeric(10,2) default 0,
  booking_type text default 'nightly' check (booking_type in ('nightly', 'weekly', 'monthly')),
  booked_at timestamptz default now(), notes text default '', created_at timestamptz default now()
);

create table price_recommendations (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade,
  recommended_date date not null, base_rate numeric(10,2), seasonal_adjustment numeric(10,2),
  competitor_rate numeric(10,2), recommended_rate numeric(10,2), actual_rate numeric(10,2),
  day_of_week integer, is_weekend boolean default false, is_holiday boolean default false,
  season text, occupancy_in_area numeric(5,2), confidence numeric(5,2),
  reasoning text, created_at timestamptz default now()
);

create table competitor_listings (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade,
  competitor_name text not null, competitor_url text default '', platform text not null,
  bedrooms integer default 0, bathrooms integer default 0, max_guests integer default 0,
  base_price numeric(10,2) default 0, cleaning_fee numeric(10,2) default 0,
  rating numeric(3,2) default 0, reviews_count integer default 0,
  last_checked_at timestamptz, notes text default '', created_at timestamptz default now()
);

create table seasonal_rules (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references properties(id) on delete cascade,
  name text not null, start_month integer not null, start_day integer not null,
  end_month integer not null, end_day integer not null,
  price_multiplier numeric(4,2) default 1.0, min_nights integer, notes text default ''
);

-- RLS
alter table properties enable row level security;
alter table property_rules enable row level security;
alter table listing_settings enable row level security;
alter table calendar_feeds enable row level security;
alter table messages enable row level security;
alter table message_threads enable row level security;
alter table vendors enable row level security;
alter table tasks enable row level security;
alter table user_settings enable row level security;
alter table calc_history enable row level security;
alter table booking_history enable row level security;
alter table price_recommendations enable row level security;
alter table competitor_listings enable row level security;
alter table seasonal_rules enable row level security;

-- Policies
create policy "Users see own properties" on properties for all using (auth.uid() = user_id);
create policy "Users see own rules" on property_rules for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own listing_settings" on listing_settings for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own calendar_feeds" on calendar_feeds for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own messages" on messages for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own threads" on message_threads for all using (message_id in (select m.id from messages m join properties p on m.property_id = p.id where p.user_id = auth.uid()));
create policy "Users see own vendors" on vendors for all using (auth.uid() = user_id);
create policy "Users see own tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users see own settings" on user_settings for all using (auth.uid() = user_id);
create policy "Users see own calc_history" on calc_history for all using (auth.uid() = user_id);
create policy "Users see own booking_history" on booking_history for all using (auth.uid() = user_id);
create policy "Users see own price_recommendations" on price_recommendations for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own competitor_listings" on competitor_listings for all using (property_id in (select id from properties where user_id = auth.uid()));
create policy "Users see own seasonal_rules" on seasonal_rules for all using (property_id in (select id from properties where user_id = auth.uid()));

-- Indexes
create index idx_properties_user on properties(user_id);
create index idx_tasks_user_status on tasks(user_id, status);
create index idx_tasks_due on tasks(due_date);
create index idx_messages_property on messages(property_id);
create index idx_message_threads_message on message_threads(message_id);
create index idx_calendar_feeds_property on calendar_feeds(property_id);
create index idx_booking_history_property on booking_history(property_id);
create index idx_booking_history_dates on booking_history(check_in, check_out);
create index idx_price_recs_property_date on price_recommendations(property_id, recommended_date);
create index idx_competitor_property on competitor_listings(property_id);
