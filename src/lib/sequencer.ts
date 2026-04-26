import { supabaseAdmin } from "./supabase-admin";
import { generateAIDraft, generateWelcomeLetter, type AIContext } from "./ai";
import { sendSequencedDraft, getTelegramConfig, type TelegramConfig } from "./telegram";

export type SequenceStep = {
  id: string;
  triggerType: string;
  label: string;
  daysOffset: number; // relative to check-in (negative = before, positive = after)
  anchorField: "check_in" | "check_out";
  templateFn: (ctx: SequenceContext) => string;
};

type SequenceContext = {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  wifiName: string;
  wifiPassword: string;
  lockCode: string;
  address: string;
  checkInTime: string;
  checkOutTime: string;
  quietHours: string;
  parking: string;
  pets: string;
  smoking: string;
  maxGuests: string;
  checkInInstructions: string;
  checkOutInstructions: string;
};

// Message sequence definition
export const MESSAGE_SEQUENCE: SequenceStep[] = [
  {
    id: "booking_confirmed",
    triggerType: "booking_confirmed",
    label: "Booking Confirmed",
    daysOffset: 0,
    anchorField: "check_in",
    templateFn: (ctx) =>
      `Hi ${ctx.guestName}! Thank you for booking ${ctx.propertyName}! We're excited to host you from ${ctx.checkIn} to ${ctx.checkOut}.\n\nI'll send you all the check-in details closer to your arrival date. In the meantime, feel free to ask any questions!\n\nBest regards`,
  },
  {
    id: "pre_arrival",
    triggerType: "pre_arrival",
    label: "3 Days Before Check-in",
    daysOffset: -3,
    anchorField: "check_in",
    templateFn: (ctx) => {
      const letter = generateWelcomeLetter(
        { name: ctx.propertyName, address: ctx.address, wifi_name: ctx.wifiName, wifi_password: ctx.wifiPassword, lock_code: ctx.lockCode, check_in_time: ctx.checkInTime, check_out_time: ctx.checkOutTime },
        { quietHours: ctx.quietHours, parking: ctx.parking, pets: ctx.pets, smoking: ctx.smoking, maxGuests: ctx.maxGuests, checkInInstructions: ctx.checkInInstructions, checkOutInstructions: ctx.checkOutInstructions }
      );
      return `Hi ${ctx.guestName}! Your stay at ${ctx.propertyName} is coming up! Here's everything you need:\n\n${letter}\n\nSafe travels! Let me know if you have any questions.`;
    },
  },
  {
    id: "check_in_day",
    triggerType: "check_in_day",
    label: "Check-in Day Morning",
    daysOffset: 0,
    anchorField: "check_in",
    templateFn: (ctx) =>
      `Hi ${ctx.guestName}! Your place is ready! 🎉\n\n🔑 Lock Code: ${ctx.lockCode}\n📍 Address: ${ctx.address}\n⏰ Check-in: ${ctx.checkInTime}\n📶 WiFi: ${ctx.wifiName} / ${ctx.wifiPassword}\n\n${ctx.checkInInstructions || "Just enter the lock code and make yourself at home!"}\n\nEnjoy your stay!`,
  },
  {
    id: "mid_stay",
    triggerType: "mid_stay",
    label: "Day 2 Check-in",
    daysOffset: 2,
    anchorField: "check_in",
    templateFn: (ctx) =>
      `Hi ${ctx.guestName}! Hope you're enjoying ${ctx.propertyName}! Just checking in to make sure everything is going well. Let me know if you need anything at all. 😊`,
  },
  {
    id: "pre_checkout",
    triggerType: "pre_checkout",
    label: "Evening Before Checkout",
    daysOffset: -1,
    anchorField: "check_out",
    templateFn: (ctx) =>
      `Hi ${ctx.guestName}! Just a friendly reminder that check-out is tomorrow at ${ctx.checkOutTime}.\n\n${ctx.checkOutInstructions || "Please make sure all doors and windows are locked when you leave."}\n\nThank you for staying with us! We hope you had a wonderful time.`,
  },
  {
    id: "post_checkout",
    triggerType: "post_checkout",
    label: "1 Day After Checkout",
    daysOffset: 1,
    anchorField: "check_out",
    templateFn: (ctx) =>
      `Hi ${ctx.guestName}! Thank you so much for staying at ${ctx.propertyName}! We hope you had an amazing time.\n\nIf you enjoyed your stay, we'd really appreciate a review — it helps us a lot! ⭐\n\nWe'd love to host you again anytime. Safe travels!`,
  },
];

function getDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return getDateStr(d);
}

// Run the full sequencer (called by cron)
export async function runMessageSequencer(): Promise<{
  checked: number;
  drafted: number;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let checked = 0;
  let drafted = 0;
  let sent = 0;

  const telegramConfig = await getTelegramConfig();
  const today = getDateStr(new Date());

  // Fetch all active messages with confirmed bookings
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*, property:properties(*)")
    .in("status", ["confirmed", "inquiry"])
    .order("last_message_at", { ascending: false });

  if (!messages) return { checked: 0, drafted: 0, sent: 0, errors: ["Failed to fetch messages"] };

  for (const message of messages) {
    checked++;
    const property = message.property;
    if (!property) continue;

    // Parse booking dates
    const dates = parseBookingDates(message.booking_dates);
    if (!dates) continue;

    // Get property rules
    const { data: rulesArr } = await supabaseAdmin
      .from("property_rules")
      .select("*")
      .eq("property_id", property.id)
      .limit(1);
    const rules = rulesArr?.[0];

    const ctx: SequenceContext = {
      guestName: message.guest_name,
      propertyName: property.name,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      wifiName: property.wifi_name || "",
      wifiPassword: property.wifi_password || "",
      lockCode: property.lock_code || "",
      address: property.address || "",
      checkInTime: property.check_in_time || "15:00",
      checkOutTime: property.check_out_time || "11:00",
      quietHours: rules?.quiet_hours || "",
      parking: rules?.parking_rules || "",
      pets: rules?.pet_policy || "",
      smoking: rules?.smoking_policy || "",
      maxGuests: rules?.max_guests ? String(rules.max_guests) : "",
      checkInInstructions: rules?.check_in_instructions || "",
      checkOutInstructions: rules?.check_out_instructions || "",
    };

    for (const step of MESSAGE_SEQUENCE) {
      const anchorDate = step.anchorField === "check_in" ? dates.checkIn : dates.checkOut;
      const triggerDate = addDays(anchorDate, step.daysOffset);

      if (triggerDate !== today) continue;

      // Check if we already sent this step for this message
      const stepKey = `seq_${step.id}_${message.id}`;
      const { data: existing } = await supabaseAdmin
        .from("message_threads")
        .select("id")
        .eq("message_id", message.id)
        .eq("sender", "ai_draft")
        .like("text", `%[${step.id}]%`)
        .limit(1);

      if (existing && existing.length > 0) continue;

      try {
        const draftText = step.templateFn(ctx);
        const taggedDraft = `[${step.id}] ${draftText}`;

        // Store in message thread
        await supabaseAdmin.from("message_threads").insert({
          message_id: message.id,
          sender: "ai_draft",
          text: taggedDraft,
          approved: false,
        });
        drafted++;

        // Send via Telegram
        if (telegramConfig) {
          const telegramSent = await sendSequencedDraft(
            telegramConfig,
            property.name,
            message.guest_name,
            message.platform,
            step.triggerType,
            draftText,
            message.booking_dates || ""
          );
          if (telegramSent) sent++;
        }
      } catch (e) {
        errors.push(`Error processing ${step.id} for ${message.guest_name}: ${String(e)}`);
      }
    }
  }

  return { checked, drafted, sent, errors };
}

function parseBookingDates(bookingDates: string): { checkIn: string; checkOut: string } | null {
  if (!bookingDates) return null;

  // Try ISO date format: "2026-04-10 to 2026-04-15"
  const isoMatch = bookingDates.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-|–)\s*(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return { checkIn: isoMatch[1], checkOut: isoMatch[2] };

  // Try "Apr 10 - Apr 15, 2026" format
  const monthMatch = bookingDates.match(/(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/);
  if (monthMatch) {
    try {
      const year = new Date().getFullYear();
      const start = new Date(`${monthMatch[1]}, ${year}`);
      const endStr = monthMatch[2].includes(String(year)) ? monthMatch[2] : `${monthMatch[2]}, ${year}`;
      const end = new Date(endStr);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { checkIn: getDateStr(start), checkOut: getDateStr(end) };
      }
    } catch {
      return null;
    }
  }

  return null;
}

// Handle immediate booking confirmation
export async function onBookingConfirmed(messageId: string): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) return;

  const { data: message } = await supabaseAdmin
    .from("messages")
    .select("*, property:properties(*)")
    .eq("id", messageId)
    .single();

  if (!message || !message.property) return;

  const property = message.property;
  const dates = parseBookingDates(message.booking_dates);

  const step = MESSAGE_SEQUENCE.find((s) => s.id === "booking_confirmed");
  if (!step) return;

  const ctx: SequenceContext = {
    guestName: message.guest_name,
    propertyName: property.name,
    checkIn: dates?.checkIn || "",
    checkOut: dates?.checkOut || "",
    wifiName: property.wifi_name || "",
    wifiPassword: property.wifi_password || "",
    lockCode: property.lock_code || "",
    address: property.address || "",
    checkInTime: property.check_in_time || "15:00",
    checkOutTime: property.check_out_time || "11:00",
    quietHours: "",
    parking: "",
    pets: "",
    smoking: "",
    maxGuests: "",
    checkInInstructions: "",
    checkOutInstructions: "",
  };

  const draftText = step.templateFn(ctx);

  await supabaseAdmin.from("message_threads").insert({
    message_id: messageId,
    sender: "ai_draft",
    text: `[booking_confirmed] ${draftText}`,
    approved: false,
  });

  await sendSequencedDraft(
    config,
    property.name,
    message.guest_name,
    message.platform,
    "booking_confirmed",
    draftText,
    message.booking_dates || ""
  );
}
