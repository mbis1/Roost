// src/lib/event-generator.ts
//
// Sprint F — deterministic event timeline generator. Given a booking,
// emit the per-step events (welcome, cleaner notify, lock-code update,
// checkout reminder, etc.) with their scheduled timestamps and the
// fully resolved message templates. Pure data — persistence happens
// in event-sync.ts.
//
// Reads:
//   - bookings (the booking row)
//   - properties (name / nickname / address)
//   - property_details (access_and_locks, arrival_flow, departure_flow,
//                       wifi_and_tech)
//   - vendors (cleaner, scoped to this property via property_ids ARRAY)
//   - bookings (the NEXT booking after this one, for lock-code handoff)
//
// Field-name compatibility: the spec uses the "v2" field names
// (welcome_message_enabled, cleaner_notification_enabled,
//  cleaner_lead_time_hours, cleaner_template) but the Sprint B.1 cards
// actually persist the "v1" names (welcome_enabled, cleaner_notify_enabled,
// cleaner_lead_time as string hours, cleaner_message_template). This
// reader tolerates both — falling back to v1 if v2 isn't set.

import { supabaseAdmin } from "./supabase-admin";
import { zonedTimeToUtc } from "./timezone";

export type GeneratedEvent = {
  step_id: string;
  scheduled_at: string;
  payload: Record<string, unknown>;
};

type BookingRow = {
  id: string;
  property_id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  checkin_date: string;
  checkout_date: string;
  status: string;
  created_at: string | null;
};

type PropertyRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  address: string | null;
};

type VendorRow = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  preferred_contact: string | null;
};

type SettingsBag = Record<string, Record<string, unknown> | undefined>;

type GeneratorCtx = {
  booking: BookingRow;
  property: PropertyRow;
  settings: SettingsBag;
  cleaner: VendorRow | null;
  nextBooking: {
    id: string;
    checkin_date: string;
    guest_name: string | null;
    guest_phone: string | null;
  } | null;
};

/* ------------------------------------------------------------------ */
/* Compatibility readers                                              */
/* ------------------------------------------------------------------ */

/** Read a boolean toggle with v2 + v1 fallback, defaulting to `defaultOn`. */
function readToggle(
  obj: Record<string, unknown> | undefined,
  keys: string[],
  defaultOn = true
): boolean {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "boolean") return v;
  }
  return defaultOn;
}

function readString(
  obj: Record<string, unknown> | undefined,
  keys: string[]
): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function readLeadHours(
  departure: Record<string, unknown> | undefined,
  fallback: number
): number {
  const raw =
    (departure?.cleaner_lead_time_hours as unknown) ??
    (departure?.cleaner_lead_time as unknown);
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

export async function generateEventsForBooking(
  bookingId: string
): Promise<GeneratedEvent[]> {
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    throw new Error(
      `Booking ${bookingId} not found: ${bookingErr?.message ?? "no row"}`
    );
  }
  const b = booking as BookingRow;
  if (b.status === "cancelled" || b.status === "blocked") return [];

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("id, name, nickname, address")
    .eq("id", b.property_id)
    .single();
  if (!prop) return [];
  const property = prop as PropertyRow;

  const { data: details } = await supabaseAdmin
    .from("property_details")
    .select("section, data")
    .eq("property_id", b.property_id);

  const settings: SettingsBag = {};
  for (const row of details || []) {
    settings[row.section as string] = (row.data || {}) as Record<
      string,
      unknown
    >;
  }

  const access = settings.access_and_locks ?? {};
  const arrival = settings.arrival_flow ?? {};
  const departure = settings.departure_flow ?? {};

  // Vendors use property_ids ARRAY — .contains() is the operator.
  const { data: cleaners } = await supabaseAdmin
    .from("vendors")
    .select("*")
    .contains("property_ids", [b.property_id])
    .eq("role", "cleaner")
    .eq("active", true)
    .limit(1);
  const cleaner = (cleaners?.[0] as VendorRow | undefined) ?? null;

  const { data: nextBookings } = await supabaseAdmin
    .from("bookings")
    .select("id, checkin_date, guest_name, guest_phone")
    .eq("property_id", b.property_id)
    .gt("checkin_date", b.checkout_date)
    .eq("status", "confirmed")
    .order("checkin_date", { ascending: true })
    .limit(1);
  const nextBooking =
    (nextBookings?.[0] as GeneratorCtx["nextBooking"]) ?? null;

  const ctx: GeneratorCtx = {
    booking: b,
    property,
    settings,
    cleaner,
    nextBooking,
  };

  const events: GeneratedEvent[] = [];

  /* ----- WELCOME_MESSAGE: emitted at booking creation/confirmation ----- */

  const welcomeOn = readToggle(
    arrival,
    ["welcome_enabled", "welcome_message_enabled"],
    true
  );
  if (welcomeOn) {
    const tmpl =
      readString(arrival, ["welcome_template"]) ||
      "Hi {{guest_name}}, welcome!\n\nYou're all set for your stay at {{property_nickname}} from {{checkin_date}} to {{checkout_date}}.\n\nCheck-in is after {{checkin_time}}. Your door code will be {{lock_code}}.\n\nWiFi: {{wifi_network}} / {{wifi_password}}\n\nLooking forward to hosting you!";
    events.push({
      step_id: "WELCOME_MESSAGE",
      scheduled_at: b.created_at || new Date().toISOString(),
      payload: {
        channel: "telegram",
        recipient_role: "host",
        summary: `Welcome message ready for ${b.guest_name || "guest"}`,
        message: resolveTemplate(tmpl, ctx),
        variables_resolved: resolveVariables(ctx),
      },
    });
  }

  /* ----- CLEANER_NOTIFY + CLEANER_ARRIVES ----- */

  const cleanerOn = readToggle(
    departure,
    ["cleaner_notify_enabled", "cleaner_notification_enabled"],
    true
  );
  if (cleanerOn && cleaner) {
    const leadHours = readLeadHours(departure, 24 * 28); // 4 weeks default
    events.push({
      step_id: "CLEANER_NOTIFY",
      scheduled_at: subtractHoursAtTime(b.checkout_date, leadHours, 11),
      payload: {
        channel: "telegram",
        recipient_role: "host",
        summary: `Time to schedule ${cleaner.name} for ${
          b.guest_name || "guest"
        } on ${b.checkout_date}`,
        message_to_cleaner: resolveTemplate(
          readString(departure, [
            "cleaner_message_template",
            "cleaner_template",
          ]) ||
            "Hi {{cleaner_name}}, heads up: checkout at {{property_nickname}} on {{checkout_date}} at {{checkout_time}}. Next check-in {{next_checkin_date}}. Let me know if you can take it!",
          ctx
        ),
        cleaner_phone: cleaner.phone,
        cleaner_preferred_contact: cleaner.preferred_contact,
        variables_resolved: resolveVariables(ctx),
      },
    });

    events.push({
      step_id: "CLEANER_ARRIVES",
      scheduled_at: setLocalTime(b.checkout_date, 13, 0),
      payload: {
        channel: "calendar_only",
        recipient_role: "host",
        summary: `${cleaner.name} arrives for turnover`,
        is_calendar_placeholder: true,
        variables_resolved: resolveVariables(ctx),
      },
    });
  }

  /* ----- LOCK_CODE_UPDATE: 11am on checkout day ----- */

  if (access.lock_type === "yale_smart_lock" || access.lock_type === undefined) {
    const codeMethod = (access.code_method as string) || "phone_last_4";
    const codeRule =
      codeMethod === "phone_last_4"
        ? "last 4 digits of guest's phone number"
        : codeMethod === "custom_static"
        ? `static code ${(access.custom_code as string) || "[not set]"}`
        : "[code method not configured]";

    let message: string;
    if (nextBooking) {
      const nextLast4 = nextBooking.guest_phone
        ? lastFour(nextBooking.guest_phone)
        : "????";
      message =
        `Update Yale lock at ${property.nickname || property.name}:\n` +
        `- Remove ${b.guest_name || "previous guest"}'s code\n` +
        `- Add new code ${nextLast4} for ${
          nextBooking.guest_name || "next guest"
        } arriving ${nextBooking.checkin_date}\n\n` +
        `Rule: ${codeRule}`;
    } else {
      message =
        `Update Yale lock at ${property.nickname || property.name}:\n` +
        `- Remove ${b.guest_name || "previous guest"}'s code\n` +
        `- No next guest booked yet; leave lock empty until next booking confirmed\n\n` +
        `Rule: ${codeRule}`;
    }

    events.push({
      step_id: "LOCK_CODE_UPDATE",
      scheduled_at: setLocalTime(b.checkout_date, 11, 0),
      payload: {
        channel: "telegram",
        recipient_role: "host",
        summary: `Lock code update — ${property.nickname || property.name}`,
        message,
        has_next_guest: !!nextBooking,
        variables_resolved: resolveVariables(ctx),
      },
    });
  }

  /* ----- CHECKOUT_REMINDER: 8am on checkout day ----- */

  const checkoutReminderOn = readToggle(
    departure,
    ["checkout_reminder_enabled"],
    true
  );
  if (checkoutReminderOn) {
    events.push({
      step_id: "CHECKOUT_REMINDER",
      scheduled_at: setLocalTime(b.checkout_date, 8, 0),
      payload: {
        channel: "telegram",
        recipient_role: "host",
        summary: `Checkout reminder for ${b.guest_name || "guest"}`,
        message_to_guest: resolveTemplate(
          readString(departure, ["checkout_reminder_template"]) ||
            "Hi {{guest_name}}, just a friendly reminder — checkout is by {{checkout_time}} today.\n\n{{checkout_instructions}}",
          ctx
        ),
        variables_resolved: resolveVariables(ctx),
      },
    });
  }

  /* ----- CONFIRM_TURNOVER: 9am the day after checkout ----- */

  if (cleaner) {
    const dayAfter = addDays(b.checkout_date, 1);
    events.push({
      step_id: "CONFIRM_TURNOVER",
      scheduled_at: setLocalTime(dayAfter, 9, 0),
      payload: {
        channel: "telegram",
        recipient_role: "host",
        summary: `Did ${cleaner.name} finish turnover at ${
          property.nickname || property.name
        }?`,
        message: `Did ${cleaner.name} complete the turnover at ${
          property.nickname || property.name
        } yesterday? Tap to confirm or flag an issue.`,
        variables_resolved: resolveVariables(ctx),
      },
    });
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* Template + variable resolution                                     */
/* ------------------------------------------------------------------ */

function resolveTemplate(template: string, ctx: GeneratorCtx): string {
  const vars = resolveVariables(ctx);
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v !== undefined && v !== null && v !== "" ? String(v) : `{{${key}}}`;
  });
}

function resolveVariables(ctx: GeneratorCtx): Record<string, string> {
  const { booking, property, settings, cleaner, nextBooking } = ctx;
  const arrival = settings.arrival_flow ?? {};
  const departure = settings.departure_flow ?? {};
  const wifi = settings.wifi_and_tech ?? {};
  const access = settings.access_and_locks ?? {};

  // WiFi card is currently a notes/free-text card in B.1, so structured
  // fields may not exist. Tolerate both `network_name`/`password` and a
  // `notes` field; the latter just won't substitute.
  const wifiNetwork =
    (wifi.network_name as string) || (wifi.network as string) || "";
  const wifiPassword =
    (wifi.password as string) || (wifi.wifi_password as string) || "";

  const lockCode =
    access.code_method === "phone_last_4" && booking.guest_phone
      ? lastFour(booking.guest_phone)
      : access.code_method === "custom_static"
      ? (access.custom_code as string) || "[code not set]"
      : "[lock code TBD]";

  return {
    guest_name: booking.guest_name || "Guest",
    guest_phone: booking.guest_phone || "",
    guest_phone_last_4: booking.guest_phone
      ? lastFour(booking.guest_phone)
      : "????",
    checkin_date: booking.checkin_date,
    checkout_date: booking.checkout_date,
    checkin_time: (arrival.checkin_time as string) || "4:00 PM",
    checkout_time: (departure.checkout_time as string) || "11:00 AM",
    checkout_instructions:
      (departure.checkout_instructions as string) ||
      "Take out trash, turn off lights and AC, lock the door.",
    nights_count: String(
      daysBetween(booking.checkin_date, booking.checkout_date)
    ),
    property_name: property.name || "",
    property_nickname: property.nickname || property.name || "",
    property_address: property.address || "",
    wifi_network: wifiNetwork,
    wifi_password: wifiPassword,
    lock_code: lockCode,
    cleaner_name: cleaner?.name || "",
    cleaner_phone: cleaner?.phone || "",
    next_checkin_date: nextBooking?.checkin_date || "TBD",
    host_name: "Joanna",
  };
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                       */
/* ------------------------------------------------------------------ */

function lastFour(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4) || "????";
}

// Wall-clock times are Eastern (PROPERTY_TZ), not UTC — "8 AM" means
// 8 AM in Cary. Fixed 2026-10-13; before that, steps fired 4–5 h early.
function setLocalTime(
  dateIso: string,
  hour: number,
  minute: number
): string {
  return zonedTimeToUtc(dateIso, hour, minute).toISOString();
}

function subtractHoursAtTime(
  dateIso: string,
  hours: number,
  hourOfDay: number
): string {
  const base = zonedTimeToUtc(dateIso, hourOfDay, 0);
  return new Date(base.getTime() - hours * 3600 * 1000).toISOString();
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
