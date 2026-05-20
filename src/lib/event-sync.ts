// src/lib/event-sync.ts
//
// Sprint F — idempotent persistence of generated events. Walks the
// output of generateEventsForBooking and reconciles against existing
// rows in booking_events:
//
//   - new step_id → insert as pending
//   - matching pending row → update scheduled_at + payload
//   - already-fired / completed / skipped → leave it alone (history)
//   - existed-as-pending but no longer generated (e.g. user toggled
//     the step off) → delete it
//
// Safe to re-run after any settings change. Sprint G will read the
// pending rows on a cron and actually fire them.

import { supabaseAdmin } from "./supabase-admin";
import { generateEventsForBooking } from "./event-generator";

export type SyncEventsResult = {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
};

export async function syncEventsForBooking(
  bookingId: string
): Promise<SyncEventsResult> {
  const result: SyncEventsResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  let generated;
  try {
    generated = await generateEventsForBooking(bookingId);
  } catch (e) {
    result.errors.push(`generate: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("property_id")
    .eq("id", bookingId)
    .single();
  if (!booking) {
    result.errors.push("booking row vanished mid-sync");
    return result;
  }

  const { data: existing } = await supabaseAdmin
    .from("booking_events")
    .select("id, step_id, status")
    .eq("booking_id", bookingId);

  type ExistingInfo = { id: string; status: string };
  const existingByStep = new Map<string, ExistingInfo>();
  for (const e of existing || []) {
    existingByStep.set(e.step_id as string, {
      id: e.id as string,
      status: e.status as string,
    });
  }

  for (const gen of generated) {
    const existingEvent = existingByStep.get(gen.step_id);
    if (!existingEvent) {
      const { error } = await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        property_id: booking.property_id,
        step_id: gen.step_id,
        scheduled_at: gen.scheduled_at,
        payload: gen.payload,
        status: "pending",
        source: "auto",
      });
      if (error) result.errors.push(`insert ${gen.step_id}: ${error.message}`);
      else result.created++;
    } else if (existingEvent.status === "pending") {
      const { error } = await supabaseAdmin
        .from("booking_events")
        .update({
          scheduled_at: gen.scheduled_at,
          payload: gen.payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingEvent.id);
      if (error) result.errors.push(`update ${gen.step_id}: ${error.message}`);
      else result.updated++;
      existingByStep.delete(gen.step_id);
    } else {
      // Already fired / completed / skipped — leave the history row alone.
      existingByStep.delete(gen.step_id);
    }
  }

  // Anything still in existingByStep wasn't generated this pass — delete
  // it only if it's pending (never touch history).
  const remaining = Array.from(existingByStep.values());
  for (const info of remaining) {
    if (info.status === "pending") {
      const { error } = await supabaseAdmin
        .from("booking_events")
        .delete()
        .eq("id", info.id);
      if (error) result.errors.push(`delete: ${error.message}`);
      else result.deleted++;
    }
  }

  return result;
}

/** Re-sync every active booking. Cron-friendly. */
export async function syncEventsForAllBookings(): Promise<{
  bookings_processed: number;
  total_created: number;
  total_updated: number;
  total_deleted: number;
  errors: string[];
}> {
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .in("status", ["confirmed", "pending"])
    .gte("checkout_date", new Date().toISOString().slice(0, 10));

  if (!bookings)
    return {
      bookings_processed: 0,
      total_created: 0,
      total_updated: 0,
      total_deleted: 0,
      errors: [],
    };

  let total_created = 0;
  let total_updated = 0;
  let total_deleted = 0;
  const errors: string[] = [];

  for (const b of bookings) {
    try {
      const r = await syncEventsForBooking(b.id as string);
      total_created += r.created;
      total_updated += r.updated;
      total_deleted += r.deleted;
      for (const e of r.errors) errors.push(`${b.id}: ${e}`);
    } catch (e) {
      errors.push(
        `${b.id}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return {
    bookings_processed: bookings.length,
    total_created,
    total_updated,
    total_deleted,
    errors,
  };
}

/** Re-sync every upcoming booking for a single property. Used when an
 *  Operations card setting changes and event timestamps need to update. */
export async function syncEventsForPropertyUpcoming(
  propertyId: string
): Promise<{ bookings_processed: number; total_created: number; total_updated: number; total_deleted: number; errors: string[] }> {
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ["confirmed", "pending"])
    .gte("checkout_date", new Date().toISOString().slice(0, 10));

  let total_created = 0;
  let total_updated = 0;
  let total_deleted = 0;
  const errors: string[] = [];

  for (const b of bookings || []) {
    try {
      const r = await syncEventsForBooking(b.id as string);
      total_created += r.created;
      total_updated += r.updated;
      total_deleted += r.deleted;
      for (const e of r.errors) errors.push(`${b.id}: ${e}`);
    } catch (e) {
      errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    bookings_processed: bookings?.length || 0,
    total_created,
    total_updated,
    total_deleted,
    errors,
  };
}
