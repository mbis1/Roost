// src/app/api/email-watches/[id]/route.ts
//
//   PATCH  → update fields (label, match_from, match_names, context_notes, active, property_id)
//   DELETE → retire the watch (sets active=false; history is kept)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const FIELDS = ["label", "match_from", "match_names", "context_notes", "active", "property_id"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) patch[f] = body[f];
  const { data, error } = await supabaseAdmin
    .from("email_watches")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, watch: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await supabaseAdmin
    .from("email_watches")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
