// src/app/api/property/[id]/calendar/route.ts
//
// Sprint E — calendar data for a property over a date range.
//
//   GET /api/property/<id>/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Returns: property metadata + base nightly rate + bookings overlapping
// the range + pricing overrides in the range + scheduled_items (tasks
// + events derived from the compiled workflow and bookings).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { WorkflowStep, WorkflowAction } from "@/lib/workflow-types";
import type { ScheduledItem } from "@/lib/calendar-utils";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type BookingRow = {
  id: string;
  checkin_date: string;
  checkout_date: string;
  guest_name: string | null;
  status: string;
};

/**
 * Classify a workflow action: is it a "task" (you do something / a
 * Telegram ping fires) or an "event" (a physical event happens)?
 * Currently all action types map to "task" except noop/advance_step.
 * Events come from bookings directly (check-in, check-out, turnover).
 */
function isTaskAction(a: WorkflowAction): boolean {
  return (
    a.type === "send_message_to_guest" ||
    a.type === "send_telegram_ping" ||
    a.type === "update_lock_code" ||
    a.type === "notify_cleaner"
  );
}

/** Map an action's type into a UI category (icon + chip color). */
function actionCategory(
  a: WorkflowAction
): "message" | "ping" | "lock" | "cleaner" | null {
  switch (a.type) {
    case "send_message_to_guest":
      return "message";
    case "send_telegram_ping":
      return "ping";
    case "update_lock_code":
      return "lock";
    case "notify_cleaner":
      return "cleaner";
    default:
      return null;
  }
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * For each booking + each time-relative compiled workflow step that has
 * task-flavored actions, project the step's fire date onto the calendar.
 * Drop items that fall outside the requested window.
 *
 * Also synthesize "event" items from the booking dates themselves
 * (check-in, check-out, turnover) so the calendar always shows what
 * physically happens, even before the workflow compiler is wired up.
 */
function buildScheduledItems(
  bookings: BookingRow[],
  steps: WorkflowStep[],
  windowStart: string,
  windowEnd: string
): ScheduledItem[] {
  const out: ScheduledItem[] = [];

  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const guest = b.guest_name || "guest";

    // Events derived from the booking itself.
    const checkinDay = b.checkin_date;
    // iCal checkout_date is exclusive; the physical checkout happens
    // the morning of that date, so we surface the event ON that date.
    const checkoutDay = b.checkout_date;
    const turnoverDay = checkoutDay; // same day for now

    if (checkinDay >= windowStart && checkinDay <= windowEnd) {
      out.push({
        iso: checkinDay,
        type: "event",
        category: "checkin",
        label: `Check-in · ${guest}`,
        booking_id: b.id,
      });
    }
    if (checkoutDay >= windowStart && checkoutDay <= windowEnd) {
      out.push({
        iso: checkoutDay,
        type: "event",
        category: "checkout",
        label: `Check-out · ${guest}`,
        booking_id: b.id,
      });
      if (turnoverDay !== checkoutDay) {
        out.push({
          iso: turnoverDay,
          type: "event",
          category: "turnover",
          label: "Turnover",
          booking_id: b.id,
        });
      }
    }

    // Tasks derived from the compiled workflow steps that have
    // time_relative triggers. Each fires once per booking.
    for (const step of steps) {
      const t = step.trigger;
      if (t.type !== "time_relative") continue;
      const relativeTo = t.relative_to;
      const offsetHours = t.offset_hours ?? 0;
      if (relativeTo !== "checkin_date" && relativeTo !== "checkout_date")
        continue;
      const anchor =
        relativeTo === "checkin_date" ? b.checkin_date : b.checkout_date;
      // Offset is in hours but we display by calendar day. Round to nearest day.
      const offsetDays = Math.round(offsetHours / 24);
      const fireIso = shiftIso(anchor, offsetDays);
      if (fireIso < windowStart || fireIso > windowEnd) continue;

      const taskActions = step.actions.filter(isTaskAction);
      for (const a of taskActions) {
        out.push({
          iso: fireIso,
          type: "task",
          category: actionCategory(a),
          label: shortenLabel(a.description || step.title),
          booking_id: b.id,
          step_id: step.id,
        });
      }
    }
  }

  // Sort by date so the UI sees them in order.
  out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return out;
}

function shortenLabel(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
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

  // Base rate: prefer pricing_rules card data, fall back to
  // properties.price_per_night so the UI never has a literal blank.
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

  // Bookings: any whose date range overlaps [startDate, endDate].
  // checkout_date is exclusive (iCal convention) so we compare with strict <.
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

  // Compiled workflow for the property — drives the task projection.
  const { data: workflowRow } = await supabaseAdmin
    .from("property_workflows")
    .select("steps")
    .eq("property_id", params.id)
    .maybeSingle();

  const compiledSteps = ((workflowRow?.steps as WorkflowStep[]) || []).filter(
    (s) => s.enabled && s.execution_mode !== "skipped"
  );

  const scheduledItems = buildScheduledItems(
    (bookings || []) as BookingRow[],
    compiledSteps,
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
      // Belt-and-suspenders: tell every cache layer (browser, Vercel CDN,
      // anything in between) not to keep this response. dynamic: force-
      // dynamic prevents Next.js's own static caching; this header
      // handles the browser + CDN edge.
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    }
  );
}
