import { NextResponse } from "next/server";
import { runMessageSequencer } from "@/lib/sequencer";

// Called by Vercel cron daily at 9am
// vercel.json: { "crons": [{ "path": "/api/message-sequencer", "schedule": "0 9 * * *" }] }
export async function GET() {
  try {
    const result = await runMessageSequencer();
    return NextResponse.json({ success: true, bookings_checked: result.checked, drafts_created: result.drafted, telegram_sent: result.sent, errors: result.errors, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Sequencer failed", details: String(error) }, { status: 500 });
  }
}

export async function POST() { return GET(); }
