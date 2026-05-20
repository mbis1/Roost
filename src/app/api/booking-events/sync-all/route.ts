// src/app/api/booking-events/sync-all/route.ts
//
// Sprint F — re-syncs booking_events for every active booking.
// Cron target (daily) and manual debug endpoint.

import { NextResponse } from "next/server";
import { syncEventsForAllBookings } from "@/lib/event-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncEventsForAllBookings();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
