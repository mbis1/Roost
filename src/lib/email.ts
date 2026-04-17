// src/lib/email.ts
//
// IMAP email ingest for Roost.
//
// Pulls every email in INBOX addressed to TARGET_ADDRESS (anjeyka@yahoo.com)
// — NO sender-domain filter — and stores each into the `emails` Supabase
// table. Dedupes on IMAP UID so it's safe to run repeatedly (via cron or
// manual trigger). Tagging is a separate feature; primary_tag is left null
// here.
//
// Two-pass design (reliable on Yahoo IMAP):
//   Pass 1: iterate envelopes via sequence-range fetch, collect matches
//   Pass 2: fetch raw source for each match by sequence number, parse body
//           with mailparser, insert into `emails`
//
// Env vars:
//   IMAP_HOST      e.g. imap.mail.yahoo.com
//   IMAP_PORT      default 993
//   IMAP_USER      full email address
//   IMAP_PASSWORD  app password (Yahoo requires app passwords)

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabase } from "@/lib/supabase";

export const TARGET_ADDRESS = "anjeyka@yahoo.com";
const DEFAULT_DAYS = 30;
const SCAN_WINDOW = 5000; // max inbox messages to scan in one run

export type IngestResult = {
  processed: number;          // envelopes that matched the To filter
  stored: number;             // newly inserted rows
  skipped_duplicates: number; // already present (dedupe hit on raw_uid)
  errors: string[];
};

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

/**
 * Main ingest. Scans the inbox, filters to anjeyka, stores new emails.
 *
 * @param options.days  How many days back to include (default 30). Older
 *                      matched envelopes are skipped.
 */
export async function processAnjeykaEmails(
  options?: { days?: number }
): Promise<IngestResult> {
  const days = options?.days ?? DEFAULT_DAYS;

  const errors: string[] = [];
  let processed = 0;
  let stored = 0;
  let skippedDuplicates = 0;

  const cfg = getImapConfig();
  if (!cfg) {
    errors.push("IMAP not configured");
    return { processed, stored, skipped_duplicates: skippedDuplicates, errors };
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
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      // Pass 1 — collect matches.
      const matches: Match[] = [];
      for await (const msg of client.fetch(range, {
        envelope: true,
        internalDate: true,
      })) {
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

        processed++;

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

      // Pass 2 — dedup, fetch body, insert.
      for (const m of matches) {
        const rawUid = String(m.uid);

        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("raw_uid", rawUid)
          .limit(1);
        if (existing && existing.length > 0) {
          skippedDuplicates++;
          continue;
        }

        let bodyText = "";
        let bodyHtml: string | null = null;

        try {
          const body = await client.fetchOne(String(m.seq), { source: true });
          if (body && body.source) {
            try {
              const parsed = await simpleParser(body.source);
              bodyText =
                parsed.text ||
                (parsed.html ? stripHtml(String(parsed.html)) : "");
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

  return {
    processed,
    stored,
    skipped_duplicates: skippedDuplicates,
    errors,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
