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

      const matchedUids =
        (await client.search({ since, to: TARGET_ADDRESS })) || [];
      totalMatched = matchedUids.length;
      matchedUidsRaw = matchedUids as number[];

      const recent = matchedUids
        .sort((a: number, b: number) => b - a)
        .slice(0, 50);

      // Try both fetchOne (per-UID) and streaming fetch; log exhaustively.
      let streamIterations = 0;
      try {
        for await (const msg of client.fetch(
          recent,
          { source: true, envelope: true, internalDate: true },
          { uid: true }
        )) {
          streamIterations++;
          const uid = (msg.uid as number) ?? 0;
          const hasSource = !!msg.source;
          const sourceLen = msg.source ? msg.source.length : 0;
          debugErrors.push(
            `stream uid=${uid} hasSource=${hasSource} len=${sourceLen} envSubject=${JSON.stringify(
              msg.envelope?.subject
            )}`
          );

          if (!msg.source) continue;

          let parsed;
          try {
            parsed = await simpleParser(msg.source);
          } catch (parseErr) {
            debugErrors.push(`uid ${uid}: simpleParser threw — ${String(parseErr)}`);
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
            uid,
            date,
            from: fromAddr,
            to: toText,
            deliveredTo,
            subject,
          });
        }
      } catch (fetchErr) {
        debugErrors.push(`stream fetch threw: ${String(fetchErr)}`);
      }
      debugErrors.push(`stream yielded ${streamIterations} iterations for ${recent.length} UIDs`);

      // Fallback: try fetchOne on each UID individually (envelope-only, no source).
      if (results.length === 0 && recent.length > 0) {
        for (const uid of recent) {
          try {
            const msg = await client.fetchOne(
              String(uid),
              { envelope: true, internalDate: true },
              { uid: true }
            );
            if (!msg) {
              debugErrors.push(`fetchOne uid=${uid} returned null/undefined`);
              continue;
            }
            const env = msg.envelope;
            const fromFirst = env?.from?.[0];
            const toFirst = env?.to?.[0];
            results.push({
              uid: uid as number,
              date: new Date(msg.internalDate || new Date()).toISOString(),
              from: fromFirst?.address || "",
              to: toFirst?.address || "",
              deliveredTo: null,
              subject: env?.subject || "",
            });
          } catch (e) {
            debugErrors.push(`fetchOne uid=${uid} threw: ${String(e)}`);
          }
        }
      }
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
