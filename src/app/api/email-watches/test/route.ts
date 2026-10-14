// src/app/api/email-watches/test/route.ts
//
// POST { watch_id } → find the most recent stored email that matches this
// watch and send its alert to Telegram now (re-sends even if it was
// alerted before). Proves the whole loop without waiting for a new email.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchesWatch, sendEmailAlert, type AlertableEmail, type EmailWatch } from "@/lib/email-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { watch_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const { data: watch } = await supabaseAdmin
    .from("email_watches")
    .select("*")
    .eq("id", body.watch_id || "")
    .maybeSingle();
  if (!watch) return NextResponse.json({ ok: false, error: "Watch not found" }, { status: 404 });

  // Scan recent emails (newest first) for the first match.
  const { data: emails, error } = await supabaseAdmin
    .from("emails")
    .select("id, from_addr, from_name, subject, body_text, received_at")
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const match = (emails || []).find((e) => matchesWatch(e as AlertableEmail, watch as EmailWatch));
  if (!match) {
    return NextResponse.json({
      ok: false,
      error: "No email in the last 500 matches this watch yet. Check the address / names.",
    });
  }
  const res = await sendEmailAlert(match as AlertableEmail, watch as EmailWatch, { force: true });
  return NextResponse.json({
    ok: res.ok,
    error: res.error,
    email: { subject: match.subject, from: match.from_name || match.from_addr, received_at: match.received_at },
  });
}
