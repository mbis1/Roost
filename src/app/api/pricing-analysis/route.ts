import { NextRequest, NextResponse } from "next/server";
import { analyzePropertyPricing, getSuggestedRates, fetchBookingHistory, fetchCompetitors, fetchSeasonalRules } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  try {
    const { propertyId } = await request.json();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    const [bookings, competitors, seasonalRules] = await Promise.all([
      fetchBookingHistory(propertyId),
      fetchCompetitors(propertyId),
      fetchSeasonalRules(propertyId),
    ]);
    const analysis = await analyzePropertyPricing(propertyId, bookings, competitors, seasonalRules);
    const suggestedRates = getSuggestedRates(analysis);
    return NextResponse.json({ success: true, analysis, suggestedRates, dataPoints: { bookings: bookings.length, competitors: competitors.length, seasonalRules: seasonalRules.length } });
  } catch (error) {
    return NextResponse.json({ error: "Analysis failed", details: String(error) }, { status: 500 });
  }
}
