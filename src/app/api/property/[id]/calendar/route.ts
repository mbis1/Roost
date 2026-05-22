// src/app/api/property/[id]/calendar/route.ts
//
// Sprint G fix — the calendar's scheduled_items now come straight from
// booking_events (Sprint F's source of truth) instead of a parallel
// projection off the compiled workflow. Otherwise the two used
// different step_id namespaces and the drawer's "Run now" button
// stayed disabled because it couldn't find a matching event row.
//
//   GET /api/property/<id>/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Returns: property metadata + base nightly rate + bookings overlapping
// the range + pricing overrides in the range + scheduled_items (every
// booking_event whose scheduled_at falls in the window, plus check-in /
// check-out / turnover synthetic event chips derived from booking
// dates so the calendar always shows the lifecycle anchors even before
// the executor has fanned out the rows).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ScheduledItem, ScheduledItemCategory } from "@/lib/calendar-utils";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type BookingRow = {
  id: string;
  checkin_date: string;
  checkout_date: string;
  guest_name: string | null;
  status: string;
};

type BookingEventRow = {
  id: string;
  booking_id: string;
  step_id: string;
  scheduled_at: string;
  status: string;
  payload: Record<string, unknown> | null;
};

/**
 * Map Sprint F's booking_event step_ids onto the calendar's
 * ScheduledItemCategory (drives the icon + chip color).
 */
function categoryForStepId(stepId: string): ScheduledItemCategory | null {
  switch (stepId) {
    case "WELCOME_MESSAGE":
      return "message";
    case "CLEANER_NOTIFY":
      return "cleaner";
    case "CLEANER_ARRIVES":
      return "cleaner";
    case "LOCK_CODE_UPDATE":
      return "lock";
    case "CHECKOUT_REMINDER":
      return "message";
    case "CONFIRM_TURNOVER":
      return "turnover";
    default:
      return null;
  }
}

function humanStepLabel(stepId: string): string {
  const map: Record<string, string> = {
    WELCOME_MESSAGE: "Welcome message",
    CLEANER_NOTIFY: "Notify cleaner",
    CLEANER_ARRIVES: "Cleaner arrives",
    LOCK_CODE_UPDATE: "Update lock code",
    CHECKOUT_REMINDER: "Checkout reminder",
    CONFIRM_TURNOVER: "Confirm turnover",
  };
  return map[stepId] || stepId;
}

function buildScheduledItems(
  bookings: BookingRow[],
  events: BookingEventRow[],
  windowStart: string,
  windowEnd: string
): ScheduledItem[] {
  const out: ScheduledItem[] = [];

  // 1) booking_events from Sprint F → these are the real, fire-able
  //    rows. Render every one in the window (including non-pending so
  //    the host can still see history on the calendar — colored by
  //    status downstream).
  for (const e of events) {
    const iso = e.scheduled_at.slice(0, 10);
    if (iso < windowStart || iso > windowEnd) continue;
    const cat = categoryForStepId(e.step_id);
    out.push({
      iso,
      type: "task",
      category: cat,
      label: humanStepLabel(e.step_id),
      booking_id: e.booking_id,
      step_id: e.step_id,
    });
  }

  // 2) Synthetic lifecycle events (check-in, check-out, turnover) —
  //    these are derived from booking dates and don't have a backing
  //    booking_event row. Useful as calendar anchors but the drawer's
  //    Run-now stays disabled for them (they're informational).
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const guest = b.guest_name || "guest";
    const checkinDay = b.checkin_date;
    const lastNight = shiftIso(b.checkout_date, -1);
    const turnoverDay = b.checkout_date;

    if (checkinDay >= windowStart && checkinDay <= windowEnd) {
      out.push({
        iso: checkinDay,
        type: "event",
        category: "checkin",
        label: `Check-in · ${guest}`,
        booking_id: b.id,
      });
    }
    if (lastNight >= windowStart && lastNight <= windowEnd) {
      out.push({
        iso: lastNight,
        type: "event",
        category: "checkout",
        label: `Check-out · ${guest}`,
        booking_id: b.id,
      });
    }
    if (turnoverDay >= windowStart && turnoverDay <= windowEnd) {
      out.push({
        iso: turnoverDay,
        type: "event",
        category: "turnover",
        label: "Turnover",
        booking_id: b.id,
      });
    }
  }

  out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") || todayIso();
  const endDate = url.searchParams.get("end") || addDays(startDate, 90);

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("id, name, nickname, primary_photo_url, price_per_night")
    .eq("id", params.id)
    .maybeSingle();

  if (!prop) {
    return NextResponse.json(
      { error: "Property not found" },
      { status: 404 }
    );
  }

  const { data: pricingDetail } = await supabaseAdmin
    .from("property_details")
    .select("data")
    .eq("property_id", params.id)
    .eq("section", "pricing_rules")
    .maybeSingle();

  const pricingData = (pricingDetail?.data as Record<string, unknown>) || {};
  const baseRate =
    typeof pricingData.base_nightly_rate === "number"
      ? pricingData.base_nightly_rate
      : typeof pricingData.base_nightly_rate === "string"
      ? parseFloat(pricingData.base_nightly_rate) || null
      : (prop.price_per_night as number | null) || null;

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("property_id", params.id)
    .lte("checkin_date", endDate)
    .gte("checkout_date", startDate)
    .order("checkin_date");

  const { data: overrides } = await supabaseAdmin
    .from("pricing_overrides")
    .select("*")
    .eq("property_id", params.id)
    .gte("date", startDate)
    .lte("date", endDate);

  // booking_events live by scheduled_at TIMESTAMP, but we filter on
  // string ISO date for the window — Postgres compares timestamptz
  // vs ISO date correctly via the lte/gte operators.
  const windowStartTs = `${startDate}T00:00:00Z`;
  const windowEndTs = `${endDate}T23:59:59Z`;
  const { data: events } = await supabaseAdmin
    .from("booking_events")
    .select("id, booking_id, step_id, scheduled_at, status, payload")
    .eq("property_id", params.id)
    .gte("scheduled_at", windowStartTs)
    .lte("scheduled_at", windowEndTs)
    .order("scheduled_at", { ascending: true });

  const scheduledItems = buildScheduledItems(
    (bookings || []) as BookingRow[],
    (events || []) as BookingEventRow[],
    startDate,
    endDate
  );

  return NextResponse.json(
    {
      property: prop,
      base_rate: baseRate,
      bookings: bookings || [],
      pricing_overrides: overrides || [],
      scheduled_items: scheduledItems,
      range: { start: startDate, end: endDate },
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    }
  );
}
