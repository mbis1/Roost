// src/lib/email.ts
//
// IMAP-based email parser for Airbnb/VRBO/Booking.com notification emails.
// Replaces the previous Gmail API approach — works with any IMAP provider
// (Yahoo, Gmail, Outlook, iCloud, Fastmail, etc.) by swapping env vars.
//
// Env vars required:
//   IMAP_HOST     e.g. imap.mail.yahoo.com
//   IMAP_PORT     default 993
//   IMAP_USER     full email address
//   IMAP_PASSWORD app password (NOT your regular password — Yahoo requires app passwords)

import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { supabase } from "@/lib/supabase";

export type Platform = "Airbnb" | "VRBO" | "Booking.com" | "Unknown";

export type ParsedGuestMessage = {
  emailId: string;
  platform: Platform;
  guestName: string;
  propertyName: string;
  messageText: string;
  bookingDates: string | null;
  status: "inquiry" | "booked" | "confirmed" | "completed";
  receivedAt: string;
};

export type FetchedEmail = {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
};

export function detectPlatform(fromEmail: string, subject: string): Platform {
  const from = fromEmail.toLowerCase();
  const subj = subject.toLowerCase();
  if (from.includes("airbnb.com") || subj.includes("airbnb")) return "Airbnb";
  if (from.includes("vrbo.com") || from.includes("homeaway.com") || from.includes("expedia.com") || subj.includes("vrbo")) return "VRBO";
  if (from.includes("booking.com")) return "Booking.com";
  return "Unknown";
}

export function parseEmailToGuestMessage(fromEmail: string, subject: string, body: string, emailId: string, receivedAt: string): ParsedGuestMessage | null {
  const platform = detectPlatform(fromEmail, subject);
  if (platform === "Unknown") return null;
  const guestName = extractGuestName(subject, body);
  const propertyName = extractPropertyName(subject, body);
  const messageText = extractMessageBody(body);
  const bookingDates = extractBookingDates(body);
  const status = detectStatus(subject, body);
  if (!guestName || !messageText) return null;
  return { emailId, platform, guestName, propertyName, messageText, bookingDates, status, receivedAt };
}

function extractGuestName(subject: string, body: string): string {
  const patterns: RegExp[] = [
    /(?:message from|inquiry from|booking from|reservation from|new request from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i,
    /^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:sent|has|wants|asks|is asking)/m,
    /Hi\s+(?:[^,]+),?\s*\n\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:sent|wrote|asked)/i,
  ];
  for (const p of patterns) {
    const m = subject.match(p) || body.match(p);
    if (m && m[1]) return m[1].trim();
  }
  const subjectName = subject.match(/from\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (subjectName && subjectName[1]) return subjectName[1].trim();
  return "";
}

function extractPropertyName(subject: string, body: string): string {
  const aboutMatch = subject.match(/about\s+(.+?)(?:\s*[-–]|\s*$)/i);
  if (aboutMatch) return aboutMatch[1].trim();
  const forMatch = subject.match(/for\s+(.+?)(?:\s*[-–]|\s*$)/i);
  if (forMatch) return forMatch[1].trim();
  const bodyMatch = body.match(/(?:property|listing|stay at)\s*[:\s]*([^<\n]+)/i);
  if (bodyMatch) return bodyMatch[1].trim().substring(0, 100);
  return "";
}

function extractMessageBody(text: string): string {
  const patterns: RegExp[] = [
    /"([^"]{20,500})"/,
    /message:\s*([^<\n]{20,500})/i,
    /(?:wrote|sent|says):\s*([^<\n]{20,500})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const cleaned = m[1].trim().split(/\n\s*(?:Reply|View|Respond|Property|---)/i)[0];
      if (cleaned.length >= 20) return cleaned.trim();
    }
  }
  return text.substring(0, 500);
}

function extractBookingDates(body: string): string | null {
  const range = body.match(/([A-Z][a-z]{2,8}\s+\d{1,2})\s*(?:[-–—]|to)\s*([A-Z][a-z]{2,8}\s+\d{1,2}(?:,?\s*\d{4})?)/);
  if (range) return `${range[1]} – ${range[2]}`;
  const ci = body.match(/check[-\s]?in\s*[:\s]*([A-Z][a-z]{2,8}\s+\d{1,2}(?:,?\s*\d{4})?)/i);
  const co = body.match(/check[-\s]?out\s*[:\s]*([A-Z][a-z]{2,8}\s+\d{1,2}(?:,?\s*\d{4})?)/i);
  if (ci && co) return `${ci[1]} – ${co[1]}`;
  return null;
}

function detectStatus(subject: string, body: string): ParsedGuestMessage["status"] {
  const s = (subject + " " + body).toLowerCase();
  if (s.includes("confirmed") || s.includes("reservation confirmed")) return "confirmed";
  if (s.includes("booked") || s.includes("booking confirmation")) return "booked";
  if (s.includes("review") || s.includes("stay completed")) return "completed";
  return "inquiry";
}

export async function matchPropertyByName(propertyName: string): Promise<string | null> {
  if (!propertyName) return null;
  const { data: properties } = await supabase.from("properties").select("id, name, address");
  if (!properties || properties.length === 0) return null;
  const target = propertyName.toLowerCase();
  const exact = properties.find((p) => p.name.toLowerCase() === target);
  if (exact) return exact.id;
  const partial = properties.find((p) => p.name.toLowerCase().includes(target) || target.includes(p.name.toLowerCase()) || p.address.toLowerCase().includes(target));
  if (partial) return partial.id;
  if (properties.length === 1) return properties[0].id;
  return null;
}

export async function storeGuestMessage(parsed: ParsedGuestMessage): Promise<string | null> {
  const { data: existing } = await supabase.from("messages").select("id").eq("last_message_preview", "email:" + parsed.emailId).limit(1);
  if (existing && existing.length > 0) return null;
  const propertyId = await matchPropertyByName(parsed.propertyName);
  if (!propertyId) { console.error("Could not match property for:", parsed.propertyName); return null; }
  const { data: existingConvo } = await supabase.from("messages").select("id").eq("guest_name", parsed.guestName).eq("property_id", propertyId).limit(1);
  if (existingConvo && existingConvo.length > 0) {
    const messageId = existingConvo[0].id;
    await supabase.from("message_threads").insert({ message_id: messageId, sender: "guest", text: parsed.messageText });
    await supabase.from("messages").update({ last_message_preview: parsed.messageText.substring(0, 100), last_message_at: parsed.receivedAt, unread: true, status: parsed.status }).eq("id", messageId);
    return messageId;
  }
  const { data: newMsg, error } = await supabase.from("messages").insert({ property_id: propertyId, guest_name: parsed.guestName, platform: parsed.platform, status: parsed.status, booking_dates: parsed.bookingDates, unread: true, last_message_preview: parsed.messageText.substring(0, 100), last_message_at: parsed.receivedAt }).select().single();
  if (error || !newMsg) { console.error("Failed to create message:", error); return null; }
  await supabase.from("message_threads").insert({ message_id: newMsg.id, sender: "guest", text: parsed.messageText });
  return newMsg.id;
}

type ImapConfig = { host: string; port: number; user: string; password: string };

function getImapConfig(): ImapConfig | null {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = parseInt(process.env.IMAP_PORT || "993", 10);
  return { host, port, user, password };
}

export async function fetchRecentEmails(maxResults: number = 20): Promise<FetchedEmail[]> {
  const cfg = getImapConfig();
  if (!cfg) { console.error("IMAP not configured."); return []; }
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.password }, logger: false });
  const emails: FetchedEmail[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const uids = await client.search({ since, or: [ { from: "airbnb.com" }, { from: "vrbo.com" }, { from: "homeaway.com" }, { from: "booking.com" }, { from: "expedia.com" } ] });
      if (!uids || uids.length === 0) return [];
      const recent = uids.sort((a, b) => b - a).slice(0, maxResults);
      for (const uid of recent) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true });
        if (!msg || !msg.source) continue;
        let parsed: ParsedMail;
        try { parsed = await simpleParser(msg.source); } catch (err) { console.error("mailparser failed for UID", uid, err); continue; }
        const fromAddr = parsed.from?.value?.[0]?.address || parsed.from?.text || msg.envelope?.from?.[0]?.address || "";
        const subject = parsed.subject || msg.envelope?.subject || "";
        const body = parsed.text || (parsed.html ? stripHtml(String(parsed.html)) : "") || "";
        const receivedAt = new Date(parsed.date || msg.internalDate || new Date()).toISOString();
        emails.push({ id: String(uid), from: fromAddr, subject, body, receivedAt });
      }
    } finally { lock.release(); }
  } catch (err) { console.error("IMAP error:", err); }
  finally { try { await client.logout(); } catch {} }
  return emails;
}

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export async function processNewEmails(): Promise<{ processed: number; stored: number; storedIds: string[]; errors: string[] }> {
  const errors: string[] = [];
  const storedIds: string[] = [];
  let processed = 0; let stored = 0;
  try {
    const emails = await fetchRecentEmails();
    for (const email of emails) {
      processed++;
      const parsed = parseEmailToGuestMessage(email.from, email.subject, email.body, email.id, email.receivedAt);
      if (!parsed) continue;
      const messageId = await storeGuestMessage(parsed);
      if (messageId) { stored++; storedIds.push(messageId); }
    }
  } catch (err) { errors.push(String(err)); }
  return { processed, stored, storedIds, errors };
}
