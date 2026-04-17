// src/app/api/email-webhook/route.ts
//
// Cron endpoint hit by cron-job.org (and usable manually via ?run=1).
// Pulls recent emails addressed to anjeyka@yahoo.com from the authenticated
// Yahoo inbox and stores each as a message in Supabase. Simple ingest — no
// AI draft / Telegram side-effects for now.

import { NextResponse } from "next/server";
import { processNewEmails } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await processNewEmails();
    return NextResponse.json({
      success: true,
      scanned: result.scanned,
      matched: result.matched,
      stored: result.stored,
      storedIds: result.storedIds,
      errors: result.errors,
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
    imap_host: process.env.IMAP_HOST || null,
    hint: "Append ?run=1 to trigger a fetch manually.",
  });
}
