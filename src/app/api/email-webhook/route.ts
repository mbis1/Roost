// src/app/api/email-webhook/route.ts
//
// Cron endpoint hit by cron-job.org every 15 minutes.
// Pulls new Airbnb/VRBO/Booking emails over IMAP, stores them as guest
// messages, then fires AI drafts to the host via Telegram for approval.

import { NextResponse } from "next/server";
import { processNewEmails } from "@/lib/email";
import { getTelegramConfig, processAndNotify } from "@/lib/telegram";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const result = await processNewEmails();
    const telegramConfig = await getTelegramConfig();
    let notified = 0;

    if (result.stored > 0 && telegramConfig) {
      let idsToNotify = result.storedIds;
      if (!idsToNotify || idsToNotify.length === 0) {
        const { data: unread } = await supabase
          .from("messages")
          .select("id")
          .eq("unread", true)
          .order("last_message_at", { ascending: false })
          .limit(result.stored);
        idsToNotify = (unread || []).map((m) => m.id);
      }
      for (const id of idsToNotify) {
        const sent = await processAndNotify(id, telegramConfig);
        if (sent) notified++;
      }
    }

    return NextResponse.json({
      success: true,
      emails_checked: result.processed,
      messages_stored: result.stored,
      telegram_notifications: notified,
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
  if (url.searchParams.get("run") === "1") return POST(request);
  return NextResponse.json({
    status: "Email webhook ready",
    imap_configured: !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD),
    imap_host: process.env.IMAP_HOST || null,
    telegram_configured: !!process.env.TELEGRAM_BOT_TOKEN,
    hint: "Append ?run=1 to trigger a fetch manually.",
  });
}
