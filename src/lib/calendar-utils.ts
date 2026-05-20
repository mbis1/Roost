// src/lib/calendar-utils.ts
//
// Sprint E — date helpers shared by the per-property month grid and the
// portfolio timeline. Stays UTC-stable so date strings (YYYY-MM-DD) round-
// trip without timezone drift.

import type { Booking, PricingOverride } from "@/lib/supabase";

export const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Convert a YYYY-MM-DD string to a Date at noon UTC (avoids TZ rollover). */
export function dateFromIso(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}

/** Convert a Date to YYYY-MM-DD using its UTC components. */
export function isoFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** YYYY-MM-DD for today, in local timezone. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** First day of the month (local time) for the given anchor. */
export function startOfMonth(anchor: Date): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
}

/** Add N months to the date (works negative). */
export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** Add N days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const d = dateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
}

/**
 * Generate every YYYY-MM-DD in the calendar grid for the given month.
 * Pads with leading days from the previous month so the grid starts on
 * Sunday, and trailing days from the next month so it ends on Saturday.
 * Each cell carries `inMonth: false` for those padding days so the UI
 * can dim them.
 */
export type GridCell = { iso: string; inMonth: boolean };

export function buildMonthGrid(anchor: Date): GridCell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const startWeekday = first.getDay(); // 0 = Sun
  const cells: GridCell[] = [];

  // Leading padding (previous month)
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - (i + 1));
    cells.push({
      iso: isoFromDateLocal(d),
      inMonth: false,
    });
  }

  // This month's days
  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({
      iso: isoFromDateLocal(d),
      inMonth: true,
    });
  }

  // Trailing padding (next month) to fill the last week
  while (cells.length % 7 !== 0) {
    const d = new Date(last);
    d.setDate(last.getDate() + (cells.length - (startWeekday + last.getDate())) + 1);
    cells.push({
      iso: isoFromDateLocal(d),
      inMonth: false,
    });
  }

  return cells;
}

/** Like isoFromDate but treats the Date as local-time (for calendar display). */
function isoFromDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* ------------------------------------------------------------------ */
/* Booking position on a date                                         */
/* ------------------------------------------------------------------ */

export type BookingPosition = "single" | "start" | "middle" | "end";

export type BookingOnDate = {
  booking: Booking;
  position: BookingPosition;
};

/**
 * iCal convention: a booking's checkout_date is exclusive — the guest
 * leaves the *morning* of that date, so it's not occupied. So a booking
 * with checkin=2026-05-09, checkout=2026-05-12 occupies May 9, 10, 11.
 *
 * Returns the booking's position relative to the given date (or null
 * if the date isn't in the booking's occupied range).
 */
export function getBookingForDate(
  iso: string,
  bookings: Booking[]
): BookingOnDate | null {
  for (const b of bookings) {
    if (iso < b.checkin_date) continue;
    if (iso >= b.checkout_date) continue;
    const lastOccupied = addDaysIso(b.checkout_date, -1);
    let position: BookingPosition;
    if (b.checkin_date === lastOccupied) position = "single";
    else if (iso === b.checkin_date) position = "start";
    else if (iso === lastOccupied) position = "end";
    else position = "middle";
    return { booking: b, position };
  }
  return null;
}

/** Pricing override for a date, or null. */
export function getOverrideForDate(
  iso: string,
  overrides: PricingOverride[]
): PricingOverride | null {
  for (const o of overrides) {
    if (o.date === iso) return o;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Scheduled items on a date                                          */
/* ------------------------------------------------------------------ */

/**
 * A "thing happening on this day" that isn't the reservation itself.
 * Two flavors today:
 *   - task: an automated action that fires on this day (Telegram ping,
 *           draft, lock-code update, cleaner notification, etc.)
 *   - event: a physical event happening on this day (check-in,
 *           checkout, cleaning, turnover)
 *
 * Surfaced as small color-coded pills inside the day cell so the host
 * can see at a glance what the day involves without expanding anything.
 */
export type ScheduledItemCategory =
  | "message"
  | "ping"
  | "lock"
  | "cleaner"
  | "checkin"
  | "checkout"
  | "turnover";

export type ScheduledItem = {
  iso: string;
  type: "task" | "event";
  /** Human-readable full label (used in the detail drawer + tooltip). */
  label: string;
  /** Short category — drives the icon + short pill text in the day cell. */
  category?: ScheduledItemCategory | null;
  /** Source booking id if derived from a booking — lets the UI link back. */
  booking_id?: string | null;
  /** Source workflow step id if derived from a compiled workflow step. */
  step_id?: string | null;
};

export function getScheduledForDate(
  iso: string,
  items: ScheduledItem[]
): ScheduledItem[] {
  return items.filter((i) => i.iso === iso);
}
