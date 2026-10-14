// src/lib/email-alerts.ts
//
// Email alerts (2026-10-13). When a newly ingested email matches an
// active row in `email_watches`, send Milo a Telegram message with the
// email and an AI-drafted reply, with buttons:
//   📋 Copy reply  → sends the reply alone as plain text (long-press to copy)
//   🔄 Redraft     → new AI draft
//   ✅ Handled     → marks the alert handled, removes the buttons
//
// Called from src/lib/email.ts after each insert (best-effort: an alert
// failure never blocks ingest). Dedupe: one alert per email (unique
// email_alerts.email_id).

import { supabaseAdmin } from "./supabase-admin";
import { callLLMText } from "./ai";
import { getTelegramConfig, type TelegramConfig } from "./telegram";
import { formatPropertyTime } from "./timezone";

export type EmailWatch = {
  id: string;
  label: string;
  match_from: string;
  match_names: string;
  property_id: string | null;
  context_notes: string;
  active: boolean;
};

export type AlertableEmail = {
  id: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string | null;
};

const BODY_SCAN_CHARS = 3000;

function list(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does this email come from / mention the watched person? */
export function matchesWatch(email: AlertableEmail, w: EmailWatch): boolean {
  const from = (email.from_addr || "").toLowerCase();
  for (const f of list(w.match_from)) {
    if (f.startsWith("@") ? from.endsWith(f) : from === f) return true;
  }
  const names = list(w.match_names);
  if (names.length === 0) return false;
  const hay = [
    email.from_name || "",
    email.subject || "",
    (email.body_text || "").slice(0, BODY_SCAN_CHARS),
  ]
    .join("\n")
    .toLowerCase();
  return names.some((n) => new RegExp(`\\b${escapeRegex(n)}\\b`, "i").test(hay));
}

export async function loadActiveWatches(): Promise<EmailWatch[]> {
  const { data, error } = await supabaseAdmin
    .from("email_watches")
    .select("*")
    .eq("active", true);
  if (error || !data) return [];
  return data as EmailWatch[];
}

/** Strip quoted reply history so the alert shows just the new message. */
export function newestPart(body: string): string {
  const lines = (body || "").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (/^From:\s/i.test(line.trim()) && out.length > 3) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function propertyContext(propertyId: string | null): Promise<string> {
  if (!propertyId) return "";
  const parts: string[] = [];
  const { data: p } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();
  if (p) {
    const keep = [
      "name", "nickname", "address", "city", "state", "bedrooms", "bathrooms",
      "max_guests", "check_in_time", "check_out_time",
    ];
    parts.push(
      "PROPERTY: " +
        keep
          .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== "")
          .map((k) => `${k}: ${p[k]}`)
          .join("; ")
    );
  }
  const { data: details } = await supabaseAdmin
    .from("property_details")
    .select("section, data")
    .eq("property_id", propertyId);
  for (const d of details || []) {
    const json = JSON.stringify(d.data);
    // Never hand secrets to the AI draft (lock codes, passwords).
    if (/password|lock|code|secret/i.test(String(d.section))) continue;
    if (json && json !== "{}") parts.push(`${d.section}: ${json.slice(0, 800)}`);
  }
  return parts.join("\n").slice(0, 4000);
}

async function aiSettings(): Promise<{ provider: string; apiKey: string; tone: string }> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("ai_provider, ai_api_key, ai_tone")
    .limit(1)
    .maybeSingle();
  return {
    provider: (data?.ai_provider as string) || "",
    apiKey: (data?.ai_api_key as string) || "",
    tone: (data?.ai_tone as string) || "friendly",
  };
}

export async function draftReply(
  email: AlertableEmail,
  watch: EmailWatch
): Promise<string> {
  const ai = await aiSettings();
  const ctx = await propertyContext(watch.property_id);
  const message = newestPart(email.body_text || "").slice(0, 3000);
  const prompt =
    `Draft a reply from Joanna, the owner/host of a rental property, to this email from ${watch.label}.\n` +
    `Tone: ${ai.tone}, warm, short (under 120 words), plain text, no subject line. ` +
    `Answer what they asked using ONLY the facts below. If a fact isn't below, don't invent it — ` +
    `say Joanna will check and get back to them. Never include lock codes or passwords. ` +
    `Sign off as "Joanna".\n\n` +
    (watch.context_notes ? `ABOUT THIS PERSON: ${watch.context_notes}\n` : "") +
    (ctx ? `${ctx}\n` : "") +
    `\nSUBJECT: ${email.subject || ""}\nTHEIR EMAIL:\n${message}\n\nReply:`;
  const out = await callLLMText(prompt, {
    provider: ai.provider,
    apiKey: ai.apiKey,
    systemPrompt:
      "You write short, accurate replies for a rental property owner. You never make up facts.",
    temperature: 0.5,
    maxTokens: 400,
  });
  if (out) return out.trim();
  const first = (watch.label.split(" ")[0] || "there").replace(/[()]/g, "");
  return `Hi ${first},\n\nThanks for your message — I'll look into this and get back to you shortly.\n\nJoanna`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function alertText(email: AlertableEmail, watch: EmailWatch, draft: string): string {
  const msg = newestPart(email.body_text || "") || "(no text)";
  const trimmed = msg.length > 1500 ? msg.slice(0, 1500) + "\n…" : msg;
  const when = email.received_at ? formatPropertyTime(email.received_at) : "";
  return (
    `📩 <b>${esc(watch.label)}</b>\n` +
    `<i>${esc(email.from_name || email.from_addr || "")}${when ? " · " + when : ""}</i>\n` +
    (email.subject ? `<b>${esc(email.subject)}</b>\n` : "") +
    `\n${esc(trimmed)}\n\n` +
    `💬 <b>Proposed reply</b>\n${esc(draft)}`
  );
}

export function alertButtons(alertId: string) {
  return [
    [
      { text: "📋 Copy reply", callback_data: `ea_copy:${alertId}` },
      { text: "🔄 Redraft", callback_data: `ea_redraft:${alertId}` },
    ],
    [{ text: "✅ Handled", callback_data: `ea_done:${alertId}` }],
  ];
}

export async function tgSend(
  config: TelegramConfig,
  text: string,
  opts: { html?: boolean; buttons?: unknown } = {}
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        ...(opts.html ? { parse_mode: "HTML" } : {}),
        disable_web_page_preview: true,
        ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
      }),
    });
    const j = await r.json();
    if (!j.ok) return { ok: false, error: j.description || `HTTP ${r.status}` };
    return { ok: true, message_id: j.result?.message_id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Send the alert for one email + watch. Inserts the email_alerts row
 * first (unique on email_id) so a re-run never double-texts.
 * `force` re-sends even if an alert already exists (used by the test button).
 */
export async function sendEmailAlert(
  email: AlertableEmail,
  watch: EmailWatch,
  opts: { force?: boolean } = {}
): Promise<{ ok: boolean; alertId?: string; error?: string; skipped?: boolean }> {
  const config = await getTelegramConfig();
  if (!config) return { ok: false, error: "Telegram not configured" };

  let alertId: string;
  const { data: existing } = await supabaseAdmin
    .from("email_alerts")
    .select("id")
    .eq("email_id", email.id)
    .maybeSingle();
  if (existing && !opts.force) return { ok: true, skipped: true, alertId: existing.id };
  if (existing) {
    alertId = existing.id as string;
  } else {
    const { data: row, error } = await supabaseAdmin
      .from("email_alerts")
      .insert({ email_id: email.id, watch_id: watch.id, status: "sent" })
      .select("id")
      .single();
    if (error || !row) {
      // Unique violation = another run already alerted this email.
      return { ok: true, skipped: true, error: error?.message };
    }
    alertId = row.id as string;
  }

  const draft = await draftReply(email, watch);
  const sent = await tgSend(config, alertText(email, watch, draft), {
    html: true,
    buttons: alertButtons(alertId),
  });
  await supabaseAdmin
    .from("email_alerts")
    .update({
      draft_reply: draft,
      telegram_message_id: sent.message_id ?? null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error,
    })
    .eq("id", alertId);
  return sent.ok ? { ok: true, alertId } : { ok: false, alertId, error: sent.error };
}

/** Ingest hook: check one new email against all active watches. Never throws. */
export async function alertIfWatched(
  email: AlertableEmail,
  watches?: EmailWatch[]
): Promise<string | null> {
  try {
    const list = watches ?? (await loadActiveWatches());
    const watch = list.find((w) => matchesWatch(email, w));
    if (!watch) return null;
    const res = await sendEmailAlert(email, watch);
    return res.ok ? null : `alert ${email.id}: ${res.error}`;
  } catch (e) {
    return `alert ${email.id}: ${String(e)}`;
  }
}
