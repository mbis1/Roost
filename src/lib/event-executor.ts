// src/lib/event-executor.ts
//
// Sprint G — fire a single pending booking_event end-to-end.
//
//   1. Load the event by id.
//   2. Bail out if not pending or if it's a calendar-only placeholder
//      (CLEANER_ARRIVES) — auto-complete it instead.
//   3. Format the event for Telegram (markdown summary + fenced
//      message body + recipient hint), attach three inline buttons
//      (Done / Edit / Skip), send via the env-vars-only helper.
//   4. On success, flip status to 'fired', stamp fired_at, persist
//      the returned message_id for later "strip buttons" edits.
//   5. On failure, flip status to 'failed' and append the upstream
//      error string to notes.
//
// The cron endpoint (/api/workflow-tick) and the per-event Run-now
// endpoint (/api/booking-events/[id]/fire) both call this.

import { supabaseAdmin } from "./supabase-admin";
import { sendTelegramMessage } from "./telegram";

export type ExecutionResult = {
  event_id: string;
  step_id: string;
  fired: boolean;
  reason?: string;
  telegram_message_id?: number;
};

type EventRow = {
  id: string;
  booking_id: string;
  property_id: string;
  step_id: string;
  status: string;
  scheduled_at: string;
  payload: Record<string, unknown> | null;
  notes: string | null;
};

export async function executeEvent(eventId: string): Promise<ExecutionResult> {
  const { data: row, error } = await supabaseAdmin
    .from("booking_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error || !row) {
    return {
      event_id: eventId,
      step_id: "",
      fired: false,
      reason: error?.message || "event not found",
    };
  }
  const event = row as EventRow;

  if (event.status !== "pending") {
    return {
      event_id: eventId,
      step_id: event.step_id,
      fired: false,
      reason: `status is ${event.status}`,
    };
  }

  // CLEANER_ARRIVES is a calendar-only placeholder — mark complete
  // without sending anything to Telegram.
  if (event.payload?.is_calendar_placeholder === true) {
    await supabaseAdmin
      .from("booking_events")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: appendNote(
          event.notes,
          "Calendar-only placeholder, auto-completed"
        ),
      })
      .eq("id", eventId);
    return {
      event_id: eventId,
      step_id: event.step_id,
      fired: false,
      reason: "calendar placeholder",
    };
  }

  const formatted = formatTelegramMessage(event);

  const result = await sendTelegramMessage(formatted.text, {
    parse_mode: "Markdown",
    inline_keyboard: [
      [
        { text: "✅ Sent / Done", callback_data: `done:${eventId}` },
        { text: "✏️ Edit", callback_data: `edit:${eventId}` },
        { text: "⏭ Skip", callback_data: `skip:${eventId}` },
      ],
    ],
  });

  if (!result.ok) {
    await supabaseAdmin
      .from("booking_events")
      .update({
        status: "failed",
        notes: appendNote(
          event.notes,
          `Telegram send failed: ${result.error}`
        ),
      })
      .eq("id", eventId);
    return {
      event_id: eventId,
      step_id: event.step_id,
      fired: false,
      reason: result.error,
    };
  }

  const newPayload = {
    ...(event.payload || {}),
    telegram_message_id: result.message_id,
  };

  await supabaseAdmin
    .from("booking_events")
    .update({
      status: "fired",
      fired_at: new Date().toISOString(),
      notes: appendNote(
        event.notes,
        `Fired to Telegram (msg_id ${result.message_id})`
      ),
      payload: newPayload,
    })
    .eq("id", eventId);

  return {
    event_id: eventId,
    step_id: event.step_id,
    fired: true,
    telegram_message_id: result.message_id,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

function formatTelegramMessage(event: EventRow): { text: string } {
  const payload = event.payload || {};
  const stepLabel = humanStepLabel(event.step_id);

  const lines: string[] = [];
  lines.push(`*🏠 Roost — ${stepLabel}*`);

  const summary = payload.summary as string | undefined;
  if (summary) {
    lines.push("");
    lines.push(summary);
  }

  const body =
    (payload.message as string | undefined) ||
    (payload.message_to_guest as string | undefined) ||
    (payload.message_to_cleaner as string | undefined);
  if (body) {
    lines.push("");
    lines.push("```");
    lines.push(body);
    lines.push("```");
  }

  if (event.step_id === "CLEANER_NOTIFY" && payload.cleaner_phone) {
    lines.push("");
    lines.push(`📞 Cleaner: ${payload.cleaner_phone}`);
  }

  const recipient = payload.recipient_role as string | undefined;
  if (recipient) {
    lines.push("");
    lines.push(
      `_To: ${recipient.charAt(0).toUpperCase() + recipient.slice(1)}_`
    );
  }

  return { text: lines.join("\n") };
}

function humanStepLabel(stepId: string): string {
  const map: Record<string, string> = {
    WELCOME_MESSAGE: "Welcome message",
    CLEANER_NOTIFY: "Schedule cleaner",
    LOCK_CODE_UPDATE: "Update lock code",
    CHECKOUT_REMINDER: "Checkout reminder",
    CONFIRM_TURNOVER: "Confirm turnover",
    CLEANER_ARRIVES: "Cleaner arrives",
  };
  return map[stepId] || stepId;
}

function appendNote(existing: string | null, line: string): string {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}`;
  return existing ? `${existing}\n${entry}` : entry;
}
