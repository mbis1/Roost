import { supabaseAdmin } from "./supabase-admin";
import { generateAIDraft, type AIContext } from "./ai";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type DraftNotification = {
  messageId: string;
  propertyName: string;
  guestName: string;
  platform: string;
  guestMessage: string;
  draftResponse: string;
  bookingDates: string;
};

// Get Telegram config. Sprint B.4: prefer the user_settings row so the
// user can manage tokens from the Settings UI; fall back to env vars so
// any pre-B.4 deployments still work without code changes.
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  let botToken = "";
  let chatId = "";
  try {
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("telegram_bot_token, telegram_chat_id")
      .limit(1)
      .maybeSingle();
    if (data) {
      botToken = (data.telegram_bot_token as string) || "";
      chatId = (data.telegram_chat_id as string) || "";
    }
  } catch {
    /* fall through to env vars */
  }
  if (!botToken) botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!chatId) chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/**
 * Verify a bot token by calling Telegram's getMe.
 * Returns the bot's metadata on success or an error string on failure.
 */
export async function verifyBotToken(
  botToken: string
): Promise<{ ok: true; bot: { id: number; username: string; first_name: string } } | { ok: false; error: string }> {
  if (!botToken) return { ok: false, error: "Bot token is empty" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const j = await r.json();
    if (!r.ok || !j.ok) {
      return { ok: false, error: j.description || `HTTP ${r.status}` };
    }
    return {
      ok: true,
      bot: {
        id: j.result.id,
        username: j.result.username,
        first_name: j.result.first_name,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Tell Telegram to POST updates to our webhook. Idempotent — Telegram
 * just overwrites whatever URL was set previously.
 */
export async function setBotWebhook(
  botToken: string,
  webhookUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!botToken) return { ok: false, error: "Bot token is empty" };
  if (!webhookUrl) return { ok: false, error: "Webhook URL is empty" };
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(
        webhookUrl
      )}`
    );
    const j = await r.json();
    if (!r.ok || !j.ok)
      return { ok: false, error: j.description || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Edit a message's text by message_id. Used after the user taps an
 * Approve / Reject inline button so the original ping reflects the
 * decision (instead of leaving stale buttons hanging around).
 */
export async function editTelegramMessage(
  config: TelegramConfig,
  messageId: number,
  text: string
): Promise<boolean> {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${config.botToken}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          message_id: messageId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    if (!r.ok) {
      console.error("editMessageText error:", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("editMessageText error:", e);
    return false;
  }
}

/**
 * Send a plain-text message with no parse_mode set. Use this for content
 * the user is going to long-press → copy → paste elsewhere (Airbnb / VRBO).
 * No <b>, no entity rendering, no link previews — what they see is what
 * they paste.
 */
export async function sendPlainTelegramMessage(
  config: TelegramConfig,
  text: string
): Promise<boolean> {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          // No parse_mode — plain text. Cleanest for copy-paste.
          disable_web_page_preview: true,
        }),
      }
    );
    if (!r.ok) {
      console.error("sendPlainTelegramMessage error:", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendPlainTelegramMessage error:", e);
    return false;
  }
}

/**
 * Acknowledge a callback_query. Required by Telegram's spec to clear the
 * "loading" spinner on the inline button the user tapped.
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (e) {
    console.error("answerCallbackQuery error:", e);
  }
}

/**
 * Sprint B.4 — send a workflow run draft to the host's Telegram with
 * Approve / Reject inline buttons. Returns the Telegram message_id so
 * the caller can persist it for later editing.
 */
export async function dispatchWorkflowRunToTelegram(
  config: TelegramConfig,
  opts: {
    runId: string;
    propertyName: string;
    stepTitle: string;
    channel: string;
    recipient: string;
    triggerLabel: string;
    draft: string;
  }
): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
  const { runId, propertyName, stepTitle, channel, recipient, triggerLabel, draft } = opts;
  const text =
    `🤖 <b>${stepTitle}</b> · ${propertyName}\n` +
    `<i>${triggerLabel} · ${channel} → ${recipient}</i>\n\n` +
    `${draft.length > 3500 ? draft.slice(0, 3500) + "\n…" : draft}\n\n` +
    `Tap below to confirm what you'd like to do.`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `wf_approve:${runId}` },
        { text: "❌ Reject", callback_data: `wf_reject:${runId}` },
      ],
    ],
  };

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
          reply_markup: replyMarkup,
        }),
      }
    );
    const j = await r.json();
    if (!r.ok || !j.ok) {
      return { ok: false, error: j.description || `HTTP ${r.status}` };
    }
    return { ok: true, messageId: j.result.message_id as number };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Send a message via Telegram Bot API
async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  replyMarkup?: any
): Promise<boolean> {
  try {
    const body: any = {
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Telegram send error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Telegram send error:", error);
    return false;
  }
}

// Send a draft guest response to host via Telegram
export async function sendDraftToTelegram(
  config: TelegramConfig,
  notification: DraftNotification
): Promise<boolean> {
  const text =
    `🏠 <b>${notification.propertyName}</b>\n` +
    `📱 ${notification.platform} • ${notification.bookingDates}\n\n` +
    `👤 <b>${notification.guestName}</b> says:\n` +
    `<i>"${notification.guestMessage.substring(0, 300)}"</i>\n\n` +
    `✏️ <b>AI Draft:</b>\n` +
    `${notification.draftResponse.substring(0, 500)}\n\n` +
    `💡 Copy this draft and paste into ${notification.platform}, or tap Regenerate for a new version.`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "📋 Copy Draft", callback_data: `copy:${notification.messageId}` },
        { text: "🔄 Regenerate", callback_data: `regen:${notification.messageId}` },
      ],
      [
        { text: "🌐 View in Roost", url: `${process.env.NEXT_PUBLIC_APP_URL || "https://roost.vercel.app"}` },
      ],
    ],
  };

  return sendTelegramMessage(config, text, replyMarkup);
}

// Send a timed sequence draft (pre-arrival, checkout reminder, etc)
export async function sendSequencedDraft(
  config: TelegramConfig,
  propertyName: string,
  guestName: string,
  platform: string,
  triggerType: string,
  draftText: string,
  bookingDates: string
): Promise<boolean> {
  const emoji: Record<string, string> = {
    booking_confirmed: "✅",
    pre_arrival: "🗓️",
    check_in_day: "🔑",
    mid_stay: "👋",
    pre_checkout: "📦",
    post_checkout: "⭐",
  };

  const text =
    `${emoji[triggerType] || "📨"} <b>Auto-Draft: ${triggerType.replace(/_/g, " ").toUpperCase()}</b>\n\n` +
    `🏠 ${propertyName} • ${platform}\n` +
    `👤 ${guestName} • ${bookingDates}\n\n` +
    `✏️ <b>Draft Message:</b>\n` +
    `${draftText.substring(0, 600)}\n\n` +
    `💡 Review and send via ${platform}.`;

  const replyMarkup = {
    inline_keyboard: [
      [{ text: "📋 Copy", callback_data: `copy:seq_${triggerType}` }],
    ],
  };

  return sendTelegramMessage(config, text, replyMarkup);
}

// Send a simple alert notification
export async function sendTelegramAlert(
  config: TelegramConfig,
  title: string,
  body: string
): Promise<boolean> {
  const text = `🔔 <b>${title}</b>\n\n${body}`;
  return sendTelegramMessage(config, text);
}

// Process incoming message: fetch property data, generate AI draft, store in thread, send via Telegram
export async function processAndNotify(
  messageId: string,
  config: TelegramConfig
): Promise<boolean> {
  try {
    // Fetch the message and its property
    const { data: message } = await supabaseAdmin
      .from("messages")
      .select("*, property:properties(*)")
      .eq("id", messageId)
      .single();

    if (!message || !message.property) return false;

    const property = message.property;

    // Get latest guest message from thread
    const { data: threads } = await supabaseAdmin
      .from("message_threads")
      .select("*")
      .eq("message_id", messageId)
      .eq("sender", "guest")
      .order("sent_at", { ascending: false })
      .limit(1);

    const lastGuestMessage = threads?.[0]?.text || message.last_message_preview || "";

    // Get property rules
    const { data: rulesArr } = await supabaseAdmin
      .from("property_rules")
      .select("*")
      .eq("property_id", property.id)
      .limit(1);
    const rules = rulesArr?.[0];

    // Get user settings for AI config
    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .select("*")
      .limit(1)
      .single();

    // Build AI context
    const aiContext: AIContext = {
      propertyName: property.name,
      guestName: message.guest_name,
      guestMessage: lastGuestMessage,
      wifi: property.wifi_name || "",
      wifiPassword: property.wifi_password || "",
      lockCode: property.lock_code || "",
      checkIn: property.check_in_time || "",
      checkOut: property.check_out_time || "",
      address: property.address || "",
      rules: {
        quietHours: rules?.quiet_hours || "",
        parking: rules?.parking_rules || "",
        pets: rules?.pet_policy || "",
        smoking: rules?.smoking_policy || "",
        maxGuests: rules?.max_guests ? String(rules.max_guests) : "",
        checkInInstructions: rules?.check_in_instructions || "",
        checkOutInstructions: rules?.check_out_instructions || "",
      },
      tone: (settings?.ai_tone as "friendly" | "formal" | "casual") || "friendly",
    };

    // Generate AI draft
    const draft = await generateAIDraft(
      aiContext,
      settings?.ai_provider || "huggingface",
      settings?.ai_api_key || ""
    );

    // Store draft in message thread
    await supabaseAdmin.from("message_threads").insert({
      message_id: messageId,
      sender: "ai_draft",
      text: draft,
      approved: false,
    });

    // Send via Telegram
    const sent = await sendDraftToTelegram(config, {
      messageId,
      propertyName: property.name,
      guestName: message.guest_name,
      platform: message.platform,
      guestMessage: lastGuestMessage,
      draftResponse: draft,
      bookingDates: message.booking_dates || "",
    });

    return sent;
  } catch (error) {
    console.error("processAndNotify error:", error);
    return false;
  }
}
