// src/app/api/email-backfill/route.ts
//
// One-time historical import endpoint. Hit this after deploy to populate
// the `emails` table with anjeyka@yahoo.com mail from the last N days
// (default 30). Idempotent — safe to re-run; dedupes on IMAP UID.
//
//   GET /api/email-backfill          (defaults to 30 days)
//   GET /api/email-backfill?days=60
//   GET /api/email-backfill?days=7

import { NextResponse } from "next/server";
import { processAnjeykaEmails } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get("days");
    const parsed = daysParam ? parseInt(daysParam, 10) : 30;
    const days =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : 30;

    const result = await processAnjeykaEmails({ days });
    return NextResponse.json({
      success: true,
      days,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Backfill failed", details: String(error) },
      { status: 500 }
    );
  }
}
