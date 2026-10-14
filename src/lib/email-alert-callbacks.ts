// src/lib/email-alert-callbacks.ts
//
// Telegram button taps on an email alert (see email-alerts.ts).
// callback_data: ea_copy:<alertId> | ea_redraft:<alertId> | ea_done:<alertId>
// Idempotent: tapping Handled twice is a no-op.

import { supabaseAdmin } from "./supabase-admin";
import { answerCallbackQuery, getTelegramConfig, sendPlainTelegramMessage } from "./telegram";
import { alertButtons, alertText, buildClaudePrompt, draftReply, tgSend, type AlertableEmail, type EmailWatch } from "./email-alerts";

async function editText(botToken: string, chatId: string, messageId: number, text: string, buttons: unknown | null) {
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons ?? [] },
    }),
  }).catch(() => undefined);
}

export async function handleEmailAlertCallback(
  data: string,
  callbackId: string,
  messageId: number | undefined
): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) return;
  const [action, alertId] = data.split(":");

  const { data: alert } = await supabaseAdmin
    .from("email_alerts")
    .select("*")
    .eq("id", alertId)
    .maybeSingle();
  if (!alert) {
    await answerCallbackQuery(config.botToken, callbackId, "Alert not found");
    return;
  }

  if (action === "ea_copy") {
    await answerCallbackQuery(config.botToken, callbackId, "Reply sent below — long-press to copy");
    await sendPlainTelegramMessage(config, (alert.draft_reply as string) || "");
    return;
  }

  if (action === "ea_prompt") {
    await answerCallbackQuery(config.botToken, callbackId, "Prompt below — long-press to copy, paste into Claude");
    const { data: email } = await supabaseAdmin
      .from("emails")
      .select("id, from_addr, from_name, subject, body_text, received_at")
      .eq("id", alert.email_id)
      .maybeSingle();
    const { data: watch } = await supabaseAdmin
      .from("email_watches")
      .select("*")
      .eq("id", alert.watch_id)
      .maybeSingle();
    if (!email || !watch) {
      await tgSend(config, "Couldn't build the prompt: the email or watch no longer exists.");
      return;
    }
    const prompt = await buildClaudePrompt(
      email as AlertableEmail,
      watch as EmailWatch,
      (alert.draft_reply as string) || undefined
    );
    await sendPlainTelegramMessage(config, prompt);
    return;
  }

  if (action === "ea_done") {
    if (alert.status !== "handled") {
      await supabaseAdmin
        .from("email_alerts")
        .update({ status: "handled", handled_at: new Date().toISOString() })
        .eq("id", alertId);
    }
    await answerCallbackQuery(config.botToken, callbackId, "Marked handled ✅");
    if (messageId) {
      await fetch(`https://api.telegram.org/bot${config.botToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: config.chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
      }).catch(() => undefined);
    }
    return;
  }

  if (action === "ea_redraft") {
    await answerCallbackQuery(config.botToken, callbackId, "Redrafting…");
    const { data: email } = await supabaseAdmin
      .from("emails")
      .select("id, from_addr, from_name, subject, body_text, received_at")
      .eq("id", alert.email_id)
      .maybeSingle();
    const { data: watch } = await supabaseAdmin
      .from("email_watches")
      .select("*")
      .eq("id", alert.watch_id)
      .maybeSingle();
    if (!email || !watch) {
      await tgSend(config, "Couldn't redraft: the email or watch no longer exists.");
      return;
    }
    const draft = await draftReply(email as AlertableEmail, watch as EmailWatch);
    await supabaseAdmin.from("email_alerts").update({ draft_reply: draft.reply }).eq("id", alertId);
    const text = alertText(email as AlertableEmail, watch as EmailWatch, draft);
    if (messageId) await editText(config.botToken, config.chatId, messageId, text, alertButtons(alertId));
    else await tgSend(config, text, { html: true, buttons: alertButtons(alertId) });
    return;
  }

  await answerCallbackQuery(config.botToken, callbackId, "Unknown action");
}
