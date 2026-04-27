import { NextRequest, NextResponse } from "next/server";
import {
  processAndNotify,
  getTelegramConfig,
  answerCallbackQuery,
  editTelegramMessage,
  sendPlainTelegramMessage,
} from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      const callbackData: string = update.callback_query.data || "";
      const callbackId: string = update.callback_query.id;
      const message = update.callback_query.message;

      // Sprint B.4 — workflow run approve / reject.
      if (callbackData.startsWith("wf_approve:") || callbackData.startsWith("wf_reject:")) {
        const isApprove = callbackData.startsWith("wf_approve:");
        const runId = callbackData.split(":")[1];
        const newStatus = isApprove ? "approved" : "rejected";
        const decidedAt = new Date().toISOString();

        // Persist decision
        const { data: runRow } = await supabaseAdmin
          .from("workflow_runs")
          .update({ status: newStatus, decided_at: decidedAt })
          .eq("id", runId)
          .select("*")
          .single();

        const config = await getTelegramConfig();
        if (config) {
          await answerCallbackQuery(
            config.botToken,
            callbackId,
            isApprove ? "Approved" : "Rejected"
          );

          if (message?.message_id && runRow) {
            const draft = (runRow.ai_refined_template || runRow.resolved_template || "") as string;
            const channel = (runRow.channel as string) || "the channel";

            if (isApprove) {
              // 1. Edit the original to a brief approval status (no body,
              //    so it doesn't get in the way visually).
              await editTelegramMessage(
                config,
                message.message_id,
                `🤖 <b>${runRow.step_id}</b>\n\n` +
                  `✅ <i>Approved. Copy-ready message below — long-press to copy and paste into ${channel}.</i>`
              );
              // 2. Send a follow-up message that is JUST the resolved
              //    text — no formatting, no header, no footer. Long-press
              //    selects the whole body cleanly.
              await sendPlainTelegramMessage(config, draft);
            } else {
              // Rejected: just acknowledge in the original message.
              await editTelegramMessage(
                config,
                message.message_id,
                `🤖 <b>${runRow.step_id}</b>\n\n❌ <i>Rejected. No message sent.</i>`
              );
            }
          }
        }
        return NextResponse.json({ ok: true });
      }

      // Legacy callbacks from earlier sprints.
      if (callbackData.startsWith("regen:")) {
        const messageId = callbackData.replace("regen:", "");
        const config = await getTelegramConfig();
        if (config) {
          await answerCallbackQuery(config.botToken, callbackId, "Regenerating...");
          await processAndNotify(messageId, config);
        }
      }
      if (callbackData.startsWith("copy:")) {
        const config = await getTelegramConfig();
        if (config) {
          await answerCallbackQuery(config.botToken, callbackId, "Draft ready to copy!");
        }
      }
    }

    if (update.message?.text) {
      const text = update.message.text;
      const chatId = update.message.chat.id;
      if (text === "/start" || text === "/chatid") {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
        // Also try the user_settings token in case env isn't set.
        let token = botToken;
        if (!token) {
          const { data } = await supabaseAdmin
            .from("user_settings")
            .select("telegram_bot_token")
            .limit(1)
            .maybeSingle();
          token = (data?.telegram_bot_token as string) || "";
        }
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text:
                `Roost Bot Connected! Your Chat ID: ${chatId}\n\n` +
                `Paste this into Settings → Telegram → Chat ID, save, and you're done.`,
            }),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "Telegram webhook ready" });
}
