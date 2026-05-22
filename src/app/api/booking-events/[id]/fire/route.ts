// src/app/api/booking-events/[id]/fire/route.ts
//
// Sprint G — manual fire for one booking_event. Powers the
// "Run now" button in the event detail drawer.

import { NextResponse } from "next/server";
import { executeEvent } from "@/lib/event-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await executeEvent(params.id);
    return NextResponse.json(
      { ok: result.fired, ...result },
      { status: result.fired ? 200 : 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
