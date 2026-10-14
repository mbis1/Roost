// src/app/api/email-watches/route.ts
//
// Email alerts settings.
//   GET  → { watches: EmailWatch[], recent: last 10 alerts }
//   POST → create a watch { label, match_from, match_names, property_id?, context_notes? }

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: watches, error } = await supabaseAdmin
    .from("email_watches")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        hint: "Run supabase-email-alerts-setup.sql in the Supabase SQL editor.",
      },
      { status: 500 }
    );
  }
  const { data: recent } = await supabaseAdmin
    .from("email_alerts")
    .select("id, status, created_at, error, watch_id, emails(subject, from_name)")
    .order("created_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ ok: true, watches: watches ?? [], recent: recent ?? [] });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const label = String(body.label || "").trim();
  if (!label) return NextResponse.json({ ok: false, error: "Label is required" }, { status: 400 });
  const row = {
    label,
    match_from: String(body.match_from || "").trim(),
    match_names: String(body.match_names || "").trim(),
    property_id: (body.property_id as string) || null,
    context_notes: String(body.context_notes || "").trim(),
  };
  if (!row.match_from && !row.match_names) {
    return NextResponse.json(
      { ok: false, error: "Add an email address or at least one name to match" },
      { status: 400 }
    );
  }
  const { data, error } = await supabaseAdmin.from("email_watches").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, watch: data });
}
