// src/lib/email.ts
//
// IMAP email ingest — simple version.
// Fetches all emails addressed to TARGET_ADDRESS (anjeyka@yahoo.com) in the
// recent inbox and stores each one as a message in Supabase. No platform
// detection, no property matching — just log everything. Filtering and
// tagging are later features.
//
// Env vars:
//   IMAP_HOST     e.g. imap.mail.yahoo.com
//   IMAP_PORT     default 993
//   IMAP_USER     full email address (the logged-in account)
//   IMAP_PASSWORD app password (Yahoo requires app passwords)

import { ImapFlow } from "imapflow";
import { supabase } from "@/lib/supabase";

const TARGET_ADDRESS = "anjeyka@yahoo.com";
const SCAN_WINDOW = 1000; // how many of the most recent inbox messages to scan

export type IngestedEmail = {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
};

type ImapConfig = { host: string; port: number; user: string; password: string };

function getImapConfig(): ImapConfig | null {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = parseInt(process.env.IMAP_PORT || "993", 10);
  return { host, port, user, password };
}

export async function processNewEmails(): Promise<{
  scanned: number;
  matched: number;
  stored: number;
  storedIds: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const storedIds: string[] = [];
  let scanned = 0;
  let matched = 0;
  let stored = 0;

  const cfg = getImapConfig();
  if (!cfg) {
    errors.push("IMAP not configured");
    return { scanned, matched, stored, storedIds, errors };
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const totalMsgs =
        client.mailbox && typeof client.mailbox !== "boolean"
          ? client.mailbox.exists || 0
          : 0;

      const start = Math.max(1, totalMsgs - (SCAN_WINDOW - 1));
      const range = `${start}:*`;
      const targetLower = TARGET_ADDRESS.toLowerCase();

      for await (const msg of client.fetch(range, {
        envelope: true,
        internalDate: true,
      })) {
        scanned++;
        const env = msg.envelope;
        if (!env) continue;

        const recipients = [
          ...(env.to || []),
          ...(env.cc || []),
          ...(env.bcc || []),
        ]
          .map((a) => (a?.address || "").toLowerCase())
          .filter(Boolean);

        if (!recipients.includes(targetLower)) continue;
        matched++;

        const uid = (msg.uid as number) ?? 0;
        const fromFirst = env.from?.[0];
        const fromAddr = fromFirst?.address || "";
        const fromName = fromFirst?.name || "";
        const guestName = fromName || fromAddr.split("@")[0] || "Unknown";
        const toText = (env.to || [])
          .map((a) =>
            a?.name ? `${a.name} <${a.address}>` : a?.address || ""
          )
          .filter(Boolean)
          .join(", ");
        const subject = env.subject || "(no subject)";
        const receivedAt = new Date(
          msg.internalDate || new Date()
        ).toISOString();

        try {
          const { id, reason } = await storeEmailAsMessage({
            uid,
            fromAddr,
            guestName,
            toText,
            subject,
            receivedAt,
          });
          if (id) {
            stored++;
            storedIds.push(id);
          } else if (reason) {
            errors.push(`uid=${uid} not stored: ${reason}`);
          }
        } catch (e) {
          errors.push(`store uid=${uid}: ${String(e)}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    errors.push(`IMAP error: ${String(err)}`);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return { scanned, matched, stored, storedIds, errors };
}

async function storeEmailAsMessage(email: {
  uid: number;
  fromAddr: string;
  guestName: string;
  toText: string;
  subject: string;
  receivedAt: string;
}): Promise<{ id: string | null; reason?: string }> {
  // Idempotency: skip if we've already ingested this UID.
  const preview = `email:${email.uid}`;
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("last_message_preview", preview)
    .limit(1);
  if (existing && existing.length > 0) {
    return { id: null, reason: "duplicate" };
  }

  const { data: inserted, error: msgErr } = await supabase
    .from("messages")
    .insert({
      property_id: null,
      guest_name: email.guestName,
      platform: "Email",
      status: "inquiry",
      booking_dates: null,
      unread: true,
      last_message_preview: preview,
      last_message_at: email.receivedAt,
    })
    .select()
    .single();

  if (msgErr || !inserted) {
    const code = (msgErr && (msgErr.code || "")) || "";
    const message = (msgErr && msgErr.message) || "unknown insert failure";
    return { id: null, reason: `insert messages failed: [${code}] ${message}` };
  }

  const bodyText = `From: ${email.fromAddr}\nTo: ${email.toText}\nDate: ${email.receivedAt}\nSubject: ${email.subject}`;
  const { error: threadErr } = await supabase
    .from("message_threads")
    .insert({
      message_id: inserted.id,
      sender: "guest",
      text: bodyText,
    });

  if (threadErr) {
    return {
      id: inserted.id,
      reason: `message stored but thread insert failed: ${threadErr.message}`,
    };
  }

  return { id: inserted.id };
}
