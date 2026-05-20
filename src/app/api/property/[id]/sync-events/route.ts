// src/app/api/property/[id]/sync-events/route.ts
//
// Sprint F — re-sync every upcoming booking's events for one property.
// Called from the client after an Operations card save so timestamps
// reflect the new settings without waiting for the daily cron.

import { NextResponse } from "next/server";
import { syncEventsForPropertyUpcoming } from "@/lib/event-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await syncEventsForPropertyUpcoming(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  ctx: { params: { id: string } }
) {
  return POST(req, ctx);
}
