// src/app/api/email-webhook/route.ts
//
// Cron endpoint hit by cron-job.org (and manually via GET ?run=1).
// Runs the standard ingest: all emails addressed to anjeyka@yahoo.com from
// the last 30 days, deduped by IMAP UID, stored into the `emails` Supabase
// table.

import { NextResponse } from "next/server";
import { processAnjeykaEmails, TARGET_ADDRESS } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await processAnjeykaEmails();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Email processing failed", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("run") === "1") return POST();
  return NextResponse.json({
    status: "Email webhook ready",
    imap_configured: !!(
      process.env.IMAP_HOST &&
      process.env.IMAP_USER &&
      process.env.IMAP_PASSWORD
    ),
    target_address: TARGET_ADDRESS,
    hint: "POST or GET with ?run=1 to trigger ingestion",
  });
}
