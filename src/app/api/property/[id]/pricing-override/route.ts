// src/app/api/property/[id]/pricing-override/route.ts
//
// Sprint E — write per-day pricing overrides.
//
//   POST   /api/property/<id>/pricing-override
//          body: { dates: ["2026-05-09", ...], price: 199, note?: string }
//          → upserts one row per date.
//
//   DELETE /api/property/<id>/pricing-override?date=YYYY-MM-DD
//          → removes the override for that single date (so it falls back
//            to the property's base rate again).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  let body: { dates?: string[]; price?: number; note?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const dates = (body.dates || []).filter(
    (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
  );
  const price = Number(body.price);
  const note = body.note ? String(body.note) : null;

  if (dates.length === 0 || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { ok: false, error: "dates (YYYY-MM-DD[]) and price required" },
      { status: 400 }
    );
  }

  const rows = dates.map((d) => ({
    property_id: params.id,
    date: d,
    price,
    note,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("pricing_overrides")
    .upsert(rows, { onConflict: "property_id,date" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, count: rows.length });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date=YYYY-MM-DD required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("pricing_overrides")
    .delete()
    .eq("property_id", params.id)
    .eq("date", date);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
