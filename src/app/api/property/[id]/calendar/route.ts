// src/app/api/property/[id]/calendar/route.ts
//
// Sprint E — calendar data for a property over a date range.
//
//   GET /api/property/<id>/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Returns: property metadata + base nightly rate + bookings overlapping
// the range + pricing overrides in the range.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") || todayIso();
  const endDate = url.searchParams.get("end") || addDays(startDate, 90);

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("id, name, nickname, primary_photo_url, price_per_night")
    .eq("id", params.id)
    .maybeSingle();

  if (!prop) {
    return NextResponse.json(
      { error: "Property not found" },
      { status: 404 }
    );
  }

  // Base rate: prefer pricing_rules card data, fall back to
  // properties.price_per_night so the UI never has a literal blank.
  const { data: pricingDetail } = await supabaseAdmin
    .from("property_details")
    .select("data")
    .eq("property_id", params.id)
    .eq("section", "pricing_rules")
    .maybeSingle();

  const pricingData = (pricingDetail?.data as Record<string, unknown>) || {};
  const baseRate =
    typeof pricingData.base_nightly_rate === "number"
      ? pricingData.base_nightly_rate
      : typeof pricingData.base_nightly_rate === "string"
      ? parseFloat(pricingData.base_nightly_rate) || null
      : (prop.price_per_night as number | null) || null;

  // Bookings: any whose date range overlaps [startDate, endDate].
  // checkout_date is exclusive (iCal convention) so we compare with strict <.
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("property_id", params.id)
    .lte("checkin_date", endDate)
    .gte("checkout_date", startDate)
    .order("checkin_date");

  const { data: overrides } = await supabaseAdmin
    .from("pricing_overrides")
    .select("*")
    .eq("property_id", params.id)
    .gte("date", startDate)
    .lte("date", endDate);

  return NextResponse.json({
    property: prop,
    base_rate: baseRate,
    bookings: bookings || [],
    pricing_overrides: overrides || [],
    range: { start: startDate, end: endDate },
  });
}
