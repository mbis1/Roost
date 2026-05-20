// src/app/api/booking/[id]/events/route.ts
//
// Sprint F — booking_events for a single booking.
//
//   GET   returns ordered events (scheduled_at ASC)
//   POST  re-runs syncEventsForBooking against the booking (idempotent)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncEventsForBooking } from "@/lib/event-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { data: events, error } = await supabaseAdmin
    .from("booking_events")
    .select("*")
    .eq("booking_id", params.id)
    .order("scheduled_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { events: events || [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await syncEventsForBooking(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
