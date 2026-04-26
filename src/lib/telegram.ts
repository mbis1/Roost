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

// Get Telegram config from env vars
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
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
