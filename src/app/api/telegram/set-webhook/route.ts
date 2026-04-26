// src/app/api/telegram/set-webhook/route.ts
//
// Sprint B.4 — point the bot at our /api/telegram-webhook endpoint via
// Telegram's setWebhook API. Auto-called when the user saves a bot token,
// or manually via the Settings → "Re-set webhook" button.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { setBotWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function deriveWebhookUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return `${explicit.replace(/\/+$/, "")}/api/telegram-webhook`;
  // Fall back to the host header on the inbound request.
  const url = new URL(req.url);
  return `${url.origin}/api/telegram-webhook`;
}

export async function POST(req: Request) {
  let body: { bot_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  let token = (body.bot_token || "").trim();
  if (!token) {
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("telegram_bot_token")
      .limit(1)
      .maybeSingle();
    token = (data?.telegram_bot_token as string) || process.env.TELEGRAM_BOT_TOKEN || "";
  }
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "No bot token configured" },
      { status: 400 }
    );
  }

  const webhookUrl = deriveWebhookUrl(req);
  const result = await setBotWebhook(token, webhookUrl);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, webhook_url: webhookUrl });
}
