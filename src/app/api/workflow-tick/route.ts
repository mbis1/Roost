// src/app/api/workflow-tick/route.ts
//
// Sprint G — cron endpoint. Finds every pending booking_event whose
// scheduled_at is in the past, fires each one (sends to Telegram with
// approval buttons), reports the totals.
//
// Bounded to 20 events per tick so a long backlog can't burn the
// 60-second function budget. cron-job.org hits this every 15 min.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { executeEvent } from "@/lib/event-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  return runTick();
}
export async function GET() {
  return runTick();
}

async function runTick() {
  const now = new Date().toISOString();

  const { data: dueEvents, error } = await supabaseAdmin
    .from("booking_events")
    .select("id, step_id, scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!dueEvents || dueEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      now,
      events_due: 0,
      events_fired: 0,
      events_failed: 0,
      events_skipped: 0,
      results: [],
      message: "No pending events due.",
    });
  }

  const results: Array<{
    event_id: string;
    step_id: string;
    fired: boolean;
    reason?: string;
    telegram_message_id?: number;
  }> = [];
  let fired = 0;
  let failed = 0;
  let skipped = 0;

  for (const ev of dueEvents) {
    try {
      const r = await executeEvent(ev.id as string);
      results.push(r);
      if (r.fired) fired++;
      else if (r.reason === "calendar placeholder") skipped++;
      else failed++;
    } catch (err) {
      results.push({
        event_id: ev.id as string,
        step_id: (ev.step_id as string) || "",
        fired: false,
        reason: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    now,
    events_due: dueEvents.length,
    events_fired: fired,
    events_failed: failed,
    events_skipped: skipped,
    results,
  });
}
