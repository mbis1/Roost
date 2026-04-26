import { NextRequest, NextResponse } from "next/server";
import {
  processAndNotify,
  getTelegramConfig,
  answerCallbackQuery,
  editTelegramMessage,
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

          // Edit the original message to reflect the decision so the
          // buttons don't sit there inviting another tap.
          if (message?.message_id && runRow) {
            const headline = isApprove
              ? "✅ Approved"
              : "❌ Rejected";
            const draft = (runRow.ai_refined_template || runRow.resolved_template || "") as string;
            const footer =
              `\n\n<i>${headline} at ${decidedAt}.</i>\n` +
              (isApprove
                ? `<i>(Sprint B.5 will dispatch this to ${runRow.channel} — for now the decision is logged.)</i>`
                : `<i>(No message sent.)</i>`);
            await editTelegramMessage(
              config,
              message.message_id,
              `🤖 <b>Workflow run · ${runRow.step_id}</b>\n\n` +
                (draft.length > 3500 ? draft.slice(0, 3500) + "\n…" : draft) +
                footer
            );
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
