// src/app/api/telegram/test/route.ts
//
// Sprint B.4 — verify a Telegram bot token (Settings → Test bot button).
// Calls Telegram getMe with the token from user_settings (or env fallback)
// and returns the bot's username + name on success.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyBotToken } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Body may include { bot_token?: string } so the user can verify a token
  // before saving it. Falls back to the saved value otherwise.
  let body: { bot_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore — empty body is fine */
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

  const result = await verifyBotToken(token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, bot: result.bot });
}

export async function GET(req: Request) {
  return POST(req);
}
