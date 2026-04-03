import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Property = {
  id: string;
  name: string;
  address: string;
  platforms: string[];
  price_per_night: number;
  cleaning_fee: number;
  wifi_name: string;
  wifi_password: string;
  lock_code: string;
  check_in_time: string;
  check_out_time: string;
  min_nights: number;
  monthly_target: number;
  rating: number;
  reviews_count: number;
  status: "listed" | "unlisted" | "snoozed";
  notes: string;
  created_at: string;
  user_id: string;
};

export type PropertyRules = {
  id: string;
  property_id: string;
  hoa_name: string;
  max_guests: number;
  quiet_hours: string;
  parking_rules: string;
  pet_policy: string;
  smoking_policy: string;
  trash_schedule: string;
  pool_rules: string;
  additional_rules: string;
  check_in_instructions: string;
  check_out_instructions: string;
};

export type ListingSettings = {
  id: string;
  property_id: string;
  title: string;
  description: string;
  cancellation_policy: string;
  instant_book: boolean;
  self_check_in: boolean;
  security_deposit: number;
  extra_guest_fee: number;
  extra_guest_after: number;
  weekly_discount: number;
  monthly_discount: number;
  max_guests: number;
  bedrooms: number;
  bathrooms: number;
  beds: number;
  amenities: string[];
};

export type CalendarFeed = {
  id: string;
  property_id: string;
  platform: string;
  ical_url: string;
  last_synced_at: string | null;
};

export type Message = {
  id: string;
  property_id: string;
  guest_name: string;
  platform: string;
  status: "inquiry" | "confirmed" | "review" | "expired" | "cancelled";
  booking_dates: string;
  unread: boolean;
  last_message_preview: string;
  last_message_at: string;
  created_at: string;
};

export type MessageThread = {
  id: string;
  message_id: string;
  sender: "guest" | "host" | "system" | "ai_draft";
  text: string;
  sent_at: string;
  approved: boolean;
};

export type Vendor = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  rate: string;
  property_ids: string[];
  rating: number;
  notes: string;
  user_id: string;
};

export type Task = {
  id: string;
  property_id: string | null;
  task: string;
  type: string;
  due_date: string;
  recurrence: string;
  status: "urgent" | "overdue" | "upcoming" | "done";
  assigned_to: string;
  cost: number;
  notes: string;
  last_completed_at: string | null;
  user_id: string;
};

export type UserSettings = {
  id: string;
  user_id: string;
  airbnb_host_fee_pct: number;
  airbnb_guest_fee_pct: number;
  vrbo_host_fee_pct: number;
  vrbo_guest_fee_pct: number;
  tax_rate: number;
  phone: string;
  email: string;
  card_last4: string;
  auto_pay_vendors: boolean;
  ai_provider: string;
  ai_api_key: string;
  ai_tone: string;
};
