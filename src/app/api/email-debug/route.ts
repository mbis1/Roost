// src/app/api/email-debug/route.ts
//
// Debug-only endpoint. Pulls the last 30 days of mail from the authenticated
// Yahoo account, filters to emails addressed to anjeyka@yahoo.com, returns
// a summary list. Stores nothing.

import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET_ADDRESS = "anjeyka@yahoo.com";

export async function GET() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  const port = parseInt(process.env.IMAP_PORT || "993", 10);

  if (!host || !user || !password) {
    return NextResponse.json(
      { error: "IMAP not configured" },
      { status: 500 }
    );
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  const results: Array<{
    uid: number;
    date: string;
    from: string;
    to: string;
    deliveredTo: string | null;
    subject: string;
  }> = [];

  let totalInboxCount = 0;
  let totalMatched = 0;
  const debugErrors: string[] = [];
  let matchedUidsRaw: number[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const allUids = (await client.search({ since })) || [];
      totalInboxCount = allUids.length;

      // Yahoo IMAP quirk: server-side `to:` search returns UIDs that can't be
      // fetched back (cross-folder virtual index). Instead, pull envelopes for
      // the most recent 500 inbox messages and filter client-side by the To
      // header. Slower but reliable across providers.
      const recentAll = allUids
        .sort((a: number, b: number) => b - a)
        .slice(0, 500);

      debugErrors.push(
        `scanning ${recentAll.length} of ${allUids.length} inbox msgs (last 30d)`
      );

      let iterations = 0;
      const targetLower = TARGET_ADDRESS.toLowerCase();

      try {
        for await (const msg of client.fetch(
          recentAll,
          { envelope: true, internalDate: true },
          { uid: true }
        )) {
          iterations++;
          const uid = (msg.uid as number) ?? 0;
          const env = msg.envelope;
          if (!env) continue;

          const toList = env.to || [];
          const ccList = env.cc || [];
          const bccList = env.bcc || [];
          const allRecipients = [...toList, ...ccList, ...bccList]
            .map((a) => (a?.address || "").toLowerCase())
            .filter(Boolean);

          if (!allRecipients.some((a) => a === targetLower)) continue;

          matchedUidsRaw.push(uid);
          const fromFirst = env.from?.[0];
          const toText = toList
            .map((a) => (a?.name ? `${a.name} <${a.address}>` : a?.address || ""))
            .filter(Boolean)
            .join(", ");

          results.push({
            uid,
            date: new Date(msg.internalDate || new Date()).toISOString(),
            from: fromFirst?.address || "",
            to: toText,
            deliveredTo: null,
            subject: env.subject || "",
          });
        }
      } catch (fetchErr) {
        debugErrors.push(`envelope fetch threw: ${String(fetchErr)}`);
      }

      totalMatched = matchedUidsRaw.length;
      debugErrors.push(
        `scanned ${iterations} envelopes, matched ${totalMatched}`
      );
    } finally {
      lock.release();
    }
  } catch (err) {
    return NextResponse.json(
      { error: "IMAP error", details: String(err), debug_errors: debugErrors },
      { status: 500 }
    );
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    imap_user: user,
    target_address: TARGET_ADDRESS,
    window: "last 30 days",
    total_inbox_count: totalInboxCount,
    total_matched: totalMatched,
    matched_uids: matchedUidsRaw,
    sample_size: results.length,
    debug_errors: debugErrors,
    messages: results,
  });
}
