// src/app/api/vendors/[id]/route.ts
//
// Sprint F — vendors PATCH (any field) + DELETE (soft via active=false).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "property_ids",
  "name",
  "role",
  "phone",
  "email",
  "preferred_contact",
  "rate_note",
  "notes",
  "active",
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v;
  }

  const { data, error } = await supabaseAdmin
    .from("vendors")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ vendor: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // Soft delete — keep the row so booking_events referencing this
  // cleaner still resolve names in history views.
  const { error } = await supabaseAdmin
    .from("vendors")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
