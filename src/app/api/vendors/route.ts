// src/app/api/vendors/route.ts
//
// Sprint F — vendors CRUD. Vendors use property_ids[] (text[]/uuid[])
// so a single cleaner can serve multiple properties. Filter with
// .contains() rather than .eq() on a scalar.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const propertyId = url.searchParams.get("property_id");
  const role = url.searchParams.get("role");

  let query = supabaseAdmin
    .from("vendors")
    .select("*")
    .eq("active", true)
    .order("role")
    .order("name");

  if (propertyId) query = query.contains("property_ids", [propertyId]);
  if (role) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  return NextResponse.json(
    { vendors: data || [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const property_ids = body.property_ids as string[] | undefined;
  const name = body.name as string | undefined;
  const role = body.role as string | undefined;

  if (!property_ids?.length || !name || !role) {
    return NextResponse.json(
      { error: "property_ids (array), name, role required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("vendors")
    .insert({
      property_ids,
      name,
      role,
      phone: (body.phone as string) || null,
      email: (body.email as string) || null,
      preferred_contact: (body.preferred_contact as string) || "sms",
      rate_note: (body.rate_note as string) || null,
      notes: (body.notes as string) || null,
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ vendor: data });
}
