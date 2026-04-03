import { NextRequest, NextResponse } from "next/server";
import { processAndNotify, getTelegramConfig } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      const callbackData = update.callback_query.data || "";
      if (callbackData.startsWith("regen:")) {
        const messageId = callbackData.replace("regen:", "");
        const config = await getTelegramConfig();
        if (config) {
          await answerCallback(update.callback_query.id, "Regenerating...");
          await processAndNotify(messageId, config);
        }
      }
      if (callbackData.startsWith("copy:")) {
        await answerCallback(update.callback_query.id, "Draft ready to copy!");
      }
    }

    if (update.message?.text) {
      const text = update.message.text;
      const chatId = update.message.chat.id;
      if (text === "/start" || text === "/chatid") {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `Roost Bot Connected! Your Chat ID: ${chatId}\n\nAdd this as TELEGRAM_CHAT_ID in Vercel.` }),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

async function answerCallback(callbackQueryId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function GET() { return NextResponse.json({ status: "Telegram webhook ready" }); }
