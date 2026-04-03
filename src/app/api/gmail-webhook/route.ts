import { NextRequest, NextResponse } from "next/server";
import { processNewEmails } from "@/lib/gmail";
import { processAndNotify, getTelegramConfig } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = body.accessToken || process.env.GMAIL_ACCESS_TOKEN || "";
    if (!accessToken) return NextResponse.json({ error: "Gmail access token required" }, { status: 400 });

    const result = await processNewEmails(accessToken);
    const telegramConfig = await getTelegramConfig();
    let notified = 0;

    if (result.stored > 0 && telegramConfig) {
      const { data: unreadMessages } = await (await import("@/lib/supabase")).supabase
        .from("messages").select("id").eq("unread", true)
        .order("last_message_at", { ascending: false }).limit(result.stored);
      if (unreadMessages) {
        for (const msg of unreadMessages) {
          const sent = await processAndNotify(msg.id, telegramConfig);
          if (sent) notified++;
        }
      }
    }

    return NextResponse.json({ success: true, emails_checked: result.processed, messages_stored: result.stored, telegram_notifications: notified, errors: result.errors, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Gmail processing failed", details: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "Gmail webhook ready", configured: !!process.env.GMAIL_ACCESS_TOKEN, telegram_configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) });
}
