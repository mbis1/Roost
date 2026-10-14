// src/lib/email-alerts.ts
//
// Email alerts (2026-10-13). When a newly ingested email matches an
// active row in `email_watches`, send a Telegram message to the configured chat with the
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

export async function propertyContext(propertyId: string | null): Promise<string> {
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
  // The curated knowledge note (section "ai_knowledge") goes in whole:
  // facts, house rules, Q&A, repair history, vendors. Seeded from the
  // project folder's 06 Properties docs; no codes or passwords in it.
  const knowledge = (details || []).find((d) => d.section === "ai_knowledge");
  const kText = (knowledge?.data as { text?: string } | undefined)?.text;
  if (kText) parts.push(`PROPERTY KNOWLEDGE:\n${kText.slice(0, 12000)}`);
  for (const d of details || []) {
    if (d.section === "ai_knowledge") continue;
    const json = JSON.stringify(d.data);
    // Never hand secrets to the AI draft (lock codes, passwords).
    if (/password|lock|code|secret|wifi/i.test(String(d.section) + json.slice(0, 200))) continue;
    if (json && json !== "{}") parts.push(`${d.section}: ${json.slice(0, 600)}`);
  }
  return parts.join("\n\n").slice(0, 16000);
}

/** Her previous emails (same sender), newest first, for continuity. */
export async function priorEmails(email: AlertableEmail): Promise<string> {
  if (!email.from_addr) return "";
  const { data } = await supabaseAdmin
    .from("emails")
    .select("id, subject, body_text, received_at")
    .eq("from_addr", email.from_addr)
    .neq("id", email.id)
    .order("received_at", { ascending: false })
    .limit(3);
  return (data || [])
    .map(
      (e) =>
        `- ${e.received_at ? formatPropertyTime(e.received_at as string) : ""} "${e.subject || ""}": ` +
        newestPart((e.body_text as string) || "").slice(0, 500).replace(/\s+/g, " ")
    )
    .join("\n");
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

export type AlertDraft = {
  summary: string;          // one line: what the problem / ask is
  urgency: "urgent" | "soon" | "routine";
  next_step: string;        // what to do next (vendor, phone, check)
  reply: string;            // the email reply to send, from Joanna
};

const URGENCY_ICON: Record<AlertDraft["urgency"], string> = {
  urgent: "🔴 Urgent",
  soon: "🟠 Soon",
  routine: "🟢 Routine",
};

function parseDraft(raw: string): AlertDraft | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!j.reply) return null;
    const u = String(j.urgency || "routine").toLowerCase();
    return {
      summary: String(j.summary || "").trim(),
      urgency: (["urgent", "soon", "routine"].includes(u) ? u : "routine") as AlertDraft["urgency"],
      next_step: String(j.next_step || "").trim(),
      reply: String(j.reply).trim(),
    };
  } catch {
    return null;
  }
}

/** Stored form of a draft (email_alerts.draft_reply keeps the reply only). */
export function draftFromStored(reply: string): AlertDraft {
  return { summary: "", urgency: "routine", next_step: "", reply };
}

export async function draftReply(
  email: AlertableEmail,
  watch: EmailWatch
): Promise<AlertDraft> {
  const ai = await aiSettings();
  const [ctx, history] = await Promise.all([
    propertyContext(watch.property_id),
    priorEmails(email),
  ]);
  const message = newestPart(email.body_text || "").slice(0, 4000);
  const firstName = (email.from_name || watch.label).split(/[\s(]/)[0] || "there";
  const prompt =
    `An email just came in from ${email.from_name || watch.label} <${email.from_addr || ""}> about the rental they live in. ` +
    `Joanna (the owner) will reply by email.\n\n` +
    `Do three things and return ONLY a JSON object with keys summary, urgency, next_step, reply:\n` +
    `- summary: one short line saying what the actual problem or request is.\n` +
    `- urgency: "urgent" (safety, water leak, no heat/AC, locked out, no power), "soon" (something broken that affects daily life), or "routine" (questions, small things, admin).\n` +
    `- next_step: one line for whoever handles this — the concrete action (e.g. which vendor to call with their phone number from the knowledge below, what to check, what to send). Use ONLY vendors/facts listed below.\n` +
    `- reply: the email reply from Joanna. Start with "Hi ${firstName}," on its own line. Respond to the specific problem she raised, using the property knowledge (e.g. known fixes, which vendor will come, house rules). ` +
    `Warm, practical, short (under 140 words), plain text, no subject line. If a fact isn't in the knowledge, don't invent it — say Joanna will check and get back to her. ` +
    `Never include door codes, lock codes or passwords. This is a 12-month lease tenant, not an Airbnb guest — don't mention Airbnb, reviews or check-out instructions. Sign off "Joanna".\n\n` +
    (watch.context_notes ? `ABOUT THIS TENANT:\n${watch.context_notes}\n\n` : "") +
    (ctx ? `${ctx}\n\n` : "") +
    (history ? `HER RECENT EARLIER EMAILS:\n${history}\n\n` : "") +
    `SUBJECT: ${email.subject || ""}\nHER EMAIL:\n${message}\n\nJSON:`;
  const out = await callLLMText(prompt, {
    provider: ai.provider,
    apiKey: ai.apiKey,
    systemPrompt:
      "You help a small rental owner answer her tenant. You are accurate, never invent facts, and output valid JSON only.",
    temperature: 0.4,
    maxTokens: 700,
  });
  const parsed = out ? parseDraft(out) : null;
  if (parsed) return parsed;
  if (out && !out.trim().startsWith("{")) return { ...draftFromStored(out.trim()) };
  return {
    summary: email.subject || "New email",
    urgency: "routine",
    next_step: "Read her email and reply (AI draft unavailable — check Settings → AI Configuration).",
    reply: `Hi ${firstName},\n\nThanks for letting me know — I'll look into this and get back to you shortly.\n\nJoanna`,
  };
}

/**
 * A ready-to-paste prompt for Claude: who she is, the house facts, her
 * earlier emails and the new one. Kept under Telegram's 4096-char limit
 * (property knowledge is trimmed to fit). No codes or passwords.
 */
export async function buildClaudePrompt(
  email: AlertableEmail,
  watch: EmailWatch,
  draft?: string
): Promise<string> {
  const [ctx, history] = await Promise.all([
    propertyContext(watch.property_id),
    priorEmails(email),
  ]);
  const msg = newestPart(email.body_text || "").slice(0, 1500);
  const head =
    `Help me answer an email from our tenant on behalf of my mom, Joanna (the owner). ` +
    `Tell me what she's asking, whether I need to send a vendor or do anything, and draft a short, warm reply from Joanna.\n\n` +
    (watch.context_notes ? `TENANT: ${watch.context_notes}\n\n` : `TENANT: ${watch.label}\n\n`);
  const tail =
    (history ? `HER EARLIER EMAILS:\n${history.slice(0, 700)}\n\n` : "") +
    `NEW EMAIL from ${email.from_name || watch.label} <${email.from_addr || ""}>` +
    (email.received_at ? ` (${formatPropertyTime(email.received_at)})` : "") +
    `\nSubject: ${email.subject || ""}\n${msg}` +
    (draft ? `\n\nROOST'S DRAFT (improve it if needed):\n${draft.slice(0, 600)}` : "");
  const room = 3900 - head.length - tail.length - 30;
  const facts = room > 200 ? `HOUSE FACTS:\n${ctx.slice(0, room)}\n\n` : "";
  return head + facts + tail;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function alertText(email: AlertableEmail, watch: EmailWatch, d: AlertDraft): string {
  const msg = newestPart(email.body_text || "") || "(no text)";
  const trimmed = msg.length > 1500 ? msg.slice(0, 1500) + "\n…" : msg;
  const when = email.received_at ? formatPropertyTime(email.received_at) : "";
  const triage =
    (d.summary ? `🔧 <b>${esc(d.summary)}</b> · ${URGENCY_ICON[d.urgency]}\n` : "") +
    (d.next_step ? `➡️ ${esc(d.next_step)}\n` : "");
  return (
    `📩 <b>New email · ${esc(watch.label)}</b>${when ? "\n" + when : ""}\n` +
    (email.subject ? `<i>${esc(email.subject)}</i>\n` : "") +
    (triage ? `\n${triage}` : "") +
    `\n${esc(trimmed)}\n\n` +
    `💬 <b>Proposed reply</b>\n${esc(d.reply)}`
  );
}

export function alertButtons(alertId: string) {
  return [
    [
      { text: "📋 Copy reply", callback_data: `ea_copy:${alertId}` },
      { text: "🧠 Claude prompt", callback_data: `ea_prompt:${alertId}` },
    ],
    [
      { text: "🔄 Redraft", callback_data: `ea_redraft:${alertId}` },
      { text: "✅ Handled", callback_data: `ea_done:${alertId}` },
    ],
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
      draft_reply: draft.reply,
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
