// src/app/api/telegram/test-send/route.ts
//
// Sprint B.4 — send a "Hello from Roost" test message to the configured
// chat ID, proving the bot token + chat ID work end-to-end. Used by the
// Settings → "Send test message" button.

import { NextResponse } from "next/server";
import { getTelegramConfig } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST() {
  const config = await getTelegramConfig();
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Telegram not configured — bot token or chat ID is missing in Settings.",
      },
      { status: 400 }
    );
  }

  const text =
    "✅ <b>Roost test message</b>\n\n" +
    "If you can see this, your Telegram bot is wired up correctly. " +
    "Workflow steps you fire from the app will land here.";

  try {
    const r = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    const j = await r.json();
    if (!r.ok || !j.ok) {
      return NextResponse.json(
        { ok: false, error: j.description || `HTTP ${r.status}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}
