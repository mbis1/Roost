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

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const allUids = (await client.search({ since })) || [];
      totalInboxCount = allUids.length;

      const matchedUids =
        (await client.search({ since, to: TARGET_ADDRESS })) || [];
      totalMatched = matchedUids.length;

      const recent = matchedUids
        .sort((a: number, b: number) => b - a)
        .slice(0, 50);

      for (const uid of recent) {
        const msg = await client.fetchOne(
          String(uid),
          { source: true, envelope: true, internalDate: true },
          { uid: true }
        );
        if (!msg || !msg.source) continue;

        let parsed;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }

        const fromAddr =
          parsed.from?.value?.[0]?.address || parsed.from?.text || "";
        const toText =
          parsed.to && !Array.isArray(parsed.to)
            ? parsed.to.text
            : Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text).join(", ")
            : "";
        const deliveredTo =
          (parsed.headers.get("delivered-to") as string) || null;
        const subject = parsed.subject || "";
        const date = new Date(
          parsed.date || msg.internalDate || new Date()
        ).toISOString();

        results.push({
          uid: uid as number,
          date,
          from: fromAddr,
          to: toText,
          deliveredTo,
          subject,
        });
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    return NextResponse.json(
      { error: "IMAP error", details: String(err) },
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
    sample_size: results.length,
    messages: results,
  });
}
