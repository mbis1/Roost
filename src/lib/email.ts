// src/lib/email.ts
//
// IMAP email ingest → writes to the `emails` table.
//
// Two-pass design:
//   Pass 1 — scan envelopes for the last SCAN_WINDOW inbox messages, filter
//            to those addressed to TARGET_ADDRESS (case-insensitive) and
//            within MAX_AGE_DAYS. Collect UID/seq/envelope for matches.
//   Pass 2 — for each match, fetch the message source (body) by sequence
//            number, parse with mailparser, insert into `emails`.
//
// Dedup is on `raw_uid`. Idempotent — safe to run repeatedly.
//
// Env vars:
//   IMAP_HOST     e.g. imap.mail.yahoo.com
//   IMAP_PORT     default 993
//   IMAP_USER     full email address
//   IMAP_PASSWORD app password (Yahoo requires app passwords)

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabase } from "@/lib/supabase";

const TARGET_ADDRESS = "anjeyka@yahoo.com";
const SCAN_WINDOW = 5000; // how many of the most recent inbox messages to scan
const MAX_AGE_DAYS = 30;  // ignore messages older than this

type Match = {
  uid: number;
  seq: number;
  fromAddr: string;
  fromName: string;
  toAddr: string;
  subject: string;
  receivedAt: string;
  messageId: string | null;
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
      const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

      // Pass 1 — collect matches.
      const matches: Match[] = [];
      for await (const msg of client.fetch(range, {
        envelope: true,
        internalDate: true,
      })) {
        scanned++;
        const env = msg.envelope;
        if (!env) continue;

        const internal = msg.internalDate
          ? new Date(msg.internalDate).getTime()
          : 0;
        if (internal && internal < cutoff) continue;

        const recipients = [
          ...(env.to || []),
          ...(env.cc || []),
          ...(env.bcc || []),
        ]
          .map((a) => (a?.address || "").toLowerCase())
          .filter(Boolean);

        if (!recipients.includes(targetLower)) continue;
        matched++;

        const fromFirst = env.from?.[0];
        const toText = (env.to || [])
          .map((a) =>
            a?.name ? `${a.name} <${a.address}>` : a?.address || ""
          )
          .filter(Boolean)
          .join(", ");

        matches.push({
          uid: (msg.uid as number) ?? 0,
          seq: (msg.seq as number) ?? 0,
          fromAddr: fromFirst?.address || "",
          fromName: fromFirst?.name || "",
          toAddr: toText,
          subject: env.subject || "",
          receivedAt: new Date(msg.internalDate || new Date()).toISOString(),
          messageId: env.messageId || null,
        });
      }

      // Pass 2 — fetch bodies for matches (seq-based; Yahoo-safe).
      for (const m of matches) {
        // Dedup: skip if we've already stored this UID.
        const rawUid = String(m.uid);
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("raw_uid", rawUid)
          .limit(1);
        if (existing && existing.length > 0) continue;

        let bodyText = "";
        let bodyHtml: string | null = null;

        try {
          const body = await client.fetchOne(String(m.seq), { source: true });
          if (body && body.source) {
            try {
              const parsed = await simpleParser(body.source);
              bodyText = parsed.text || "";
              bodyHtml = parsed.html ? String(parsed.html) : null;
            } catch (parseErr) {
              errors.push(
                `mailparser uid=${m.uid} seq=${m.seq}: ${String(parseErr)}`
              );
            }
          }
        } catch (fetchErr) {
          errors.push(
            `body fetch uid=${m.uid} seq=${m.seq}: ${String(fetchErr)}`
          );
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("emails")
          .insert({
            from_addr: m.fromAddr,
            from_name: m.fromName,
            to_addr: m.toAddr,
            subject: m.subject,
            body_text: bodyText,
            body_html: bodyHtml,
            received_at: m.receivedAt,
            read: false,
            primary_tag: null,
            secondary_tags: [],
            property_id: null,
            thread_id: m.messageId,
            raw_uid: rawUid,
          })
          .select()
          .single();

        if (insertErr || !inserted) {
          const code = insertErr?.code || "";
          const message = insertErr?.message || "unknown insert failure";
          errors.push(`insert uid=${m.uid}: [${code}] ${message}`);
          continue;
        }

        stored++;
        storedIds.push(inserted.id);
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
