import { NextRequest, NextResponse } from "next/server";
import {
  processAndNotify,
  getTelegramConfig,
  answerCallbackQuery,
  editTelegramMessage,
  sendPlainTelegramMessage,
  answerTelegramCallback,
  editTelegramMessageReplyMarkup,
  sendTelegramMessage,
} from "@/lib/telegram";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { handleEmailAlertCallback } from "@/lib/email-alert-callbacks";

/** Sprint G — appended to a booking_event's notes column for audit. */
function appendNote(existing: string | null, line: string): string {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}`;
  return existing ? `${existing}\n${entry}` : entry;
}

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();

    if (update.callback_query) {
      const callbackData: string = update.callback_query.data || "";
      const callbackId: string = update.callback_query.id;
      const message = update.callback_query.message;

      // Sprint G — booking_event approval/skip/edit callbacks. Prefixes
      // are done: / skip: / edit: and the value after the colon is the
      // booking_event uuid. These need to come before the legacy
      // wf_approve / wf_reject handling because the prefix space is
      // distinct but we want to fail fast on the new flow.
      if (
        callbackData.startsWith("done:") ||
        callbackData.startsWith("skip:") ||
        callbackData.startsWith("edit:")
      ) {
        return await handleBookingEventCallback(
          callbackData,
          callbackId,
          message?.message_id as number | undefined
        );
      }

      // Email alerts — copy / redraft / handled.
      if (callbackData.startsWith("ea_")) {
        await handleEmailAlertCallback(callbackData, callbackId, message?.message_id as number | undefined);
        return NextResponse.json({ ok: true });
      }

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

/* ------------------------------------------------------------------ */
/* Sprint G — booking_event callback handler                          */
/* ------------------------------------------------------------------ */

async function handleBookingEventCallback(
  data: string,
  callbackId: string,
  messageId: number | undefined
) {
  const [action, eventId] = data.split(":");
  if (!eventId) {
    await answerTelegramCallback(callbackId, "Invalid callback");
    return NextResponse.json({ ok: false });
  }

  const { data: event } = await supabaseAdmin
    .from("booking_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) {
    await answerTelegramCallback(callbackId, "Event not found");
    return NextResponse.json({ ok: false });
  }

  if (action === "done") {
    await supabaseAdmin
      .from("booking_events")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: appendNote(
          event.notes as string | null,
          "User marked complete via Telegram"
        ),
      })
      .eq("id", eventId);
    await answerTelegramCallback(callbackId, "Marked done ✅");
    if (messageId) await editTelegramMessageReplyMarkup(messageId, null);
    return NextResponse.json({ ok: true });
  }

  if (action === "skip") {
    await supabaseAdmin
      .from("booking_events")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        notes: appendNote(
          event.notes as string | null,
          "User skipped via Telegram"
        ),
      })
      .eq("id", eventId);
    await answerTelegramCallback(callbackId, "Skipped ⏭");
    if (messageId) await editTelegramMessageReplyMarkup(messageId, null);
    return NextResponse.json({ ok: true });
  }

  if (action === "edit") {
    const bookingId = event.booking_id as string;
    const editUrl = `https://roost-pi.vercel.app/booking/${bookingId}`;
    await answerTelegramCallback(callbackId, "Open in Roost to edit");
    await sendTelegramMessage(
      `✏️ To edit this step's template, open the booking in Roost:\n${editUrl}\n\n(Inline editing via Telegram coming soon.)`
    );
    return NextResponse.json({ ok: true });
  }

  await answerTelegramCallback(callbackId, "Unknown action");
  return NextResponse.json({ ok: false });
}
