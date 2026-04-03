import { supabase } from "./supabase";

export type BookingRecord = {
  id: string; property_id: string; platform: string; check_in: string; check_out: string;
  nights: number; nightly_rate: number; cleaning_fee: number; host_payout: number;
  booking_type: "nightly" | "weekly" | "monthly"; booked_at: string;
};

export type CompetitorListing = {
  id: string; property_id: string; competitor_name: string; competitor_url: string;
  platform: string; bedrooms: number; bathrooms: number; base_price: number;
  cleaning_fee: number; rating: number; reviews_count: number;
};

export type SeasonalRule = {
  id: string; property_id: string; name: string; start_month: number; start_day: number;
  end_month: number; end_day: number; price_multiplier: number; min_nights: number | null;
};

export type PriceRecommendation = {
  date: string; baseRate: number; seasonalAdjustment: number; competitorRate: number | null;
  recommendedRate: number; dayOfWeek: number; isWeekend: boolean; season: string;
  confidence: number; reasoning: string;
};

export type PricingAnalysis = {
  propertyId: string;
  avgNightlyRate: number; medianNightlyRate: number; minRate: number; maxRate: number;
  totalBookings: number; totalNights: number; totalRevenue: number; avgOccupancyPercent: number;
  avgWeekdayRate: number; avgWeekendRate: number; avgWeeklyRate: number; avgMonthlyRate: number;
  seasonalTrends: SeasonalTrend[]; monthlyBreakdown: MonthlyStats[];
  recommendations: PriceRecommendation[];
  competitorAvgPrice: number | null; competitorCount: number; pricePosition: string;
};

export type SeasonalTrend = { season: string; avgRate: number; bookingCount: number; avgOccupancy: number; multiplier: number; };
export type MonthlyStats = { month: number; monthName: string; avgRate: number; bookingCount: number; nightsBooked: number; revenue: number; occupancyPercent: number; };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKEND_DAYS = [0, 5, 6];

function getMonth(dateStr: string): number { return new Date(dateStr).getMonth(); }
function getDayOfWeek(dateStr: string): number { return new Date(dateStr).getDay(); }
function isWeekend(dateStr: string): boolean { return WEEKEND_DAYS.includes(getDayOfWeek(dateStr)); }
function determineSeason(month: number): string {
  if (month >= 5 && month <= 8) return "peak";
  if (month >= 3 && month <= 4) return "shoulder";
  if (month >= 9 && month <= 10) return "shoulder";
  return "off";
}
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function analyzePropertyPricing(
  propertyId: string, bookings: BookingRecord[], competitors: CompetitorListing[], seasonalRules: SeasonalRule[]
): Promise<PricingAnalysis> {
  const propBookings = bookings.filter(b => b.property_id === propertyId);
  const propCompetitors = competitors.filter(c => c.property_id === propertyId);

  const rates = propBookings.map(b => b.nightly_rate);
  const avgNightlyRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const medianNightlyRate = median(rates);
  const minRate = rates.length > 0 ? Math.min(...rates) : 0;
  const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
  const totalNights = propBookings.reduce((s, b) => s + b.nights, 0);
  const totalRevenue = propBookings.reduce((s, b) => s + b.host_payout, 0);
  const avgOccupancyPercent = Math.min(100, (totalNights / 365) * 100);

  const weekdayBookings = propBookings.filter(b => !isWeekend(b.check_in));
  const weekendBookings = propBookings.filter(b => isWeekend(b.check_in));
  const avgWeekdayRate = weekdayBookings.length > 0 ? weekdayBookings.reduce((s, b) => s + b.nightly_rate, 0) / weekdayBookings.length : avgNightlyRate;
  const avgWeekendRate = weekendBookings.length > 0 ? weekendBookings.reduce((s, b) => s + b.nightly_rate, 0) / weekendBookings.length : avgNightlyRate * 1.1;

  const weeklyBookings = propBookings.filter(b => b.booking_type === "weekly");
  const monthlyBookings = propBookings.filter(b => b.booking_type === "monthly");
  const avgWeeklyRate = weeklyBookings.length > 0 ? weeklyBookings.reduce((s, b) => s + b.nightly_rate, 0) / weeklyBookings.length : avgNightlyRate * 0.9;
  const avgMonthlyRate = monthlyBookings.length > 0 ? monthlyBookings.reduce((s, b) => s + b.nightly_rate, 0) / monthlyBookings.length : avgNightlyRate * 0.75;

  const monthlyBreakdown: MonthlyStats[] = [];
  for (let m = 0; m < 12; m++) {
    const mb = propBookings.filter(b => getMonth(b.check_in) === m);
    const nights = mb.reduce((s, b) => s + b.nights, 0);
    const revenue = mb.reduce((s, b) => s + b.host_payout, 0);
    const mRates = mb.map(b => b.nightly_rate);
    monthlyBreakdown.push({ month: m, monthName: MONTH_NAMES[m], avgRate: mRates.length > 0 ? mRates.reduce((a, b) => a + b, 0) / mRates.length : 0, bookingCount: mb.length, nightsBooked: nights, revenue, occupancyPercent: Math.min(100, (nights / 30) * 100) });
  }

  const seasons = ["peak", "shoulder", "off"];
  const seasonalTrends: SeasonalTrend[] = seasons.map(season => {
    const sBookings = propBookings.filter(b => determineSeason(getMonth(b.check_in)) === season);
    const sRates = sBookings.map(b => b.nightly_rate);
    const sAvg = sRates.length > 0 ? sRates.reduce((a, b) => a + b, 0) / sRates.length : 0;
    return { season, avgRate: sAvg, bookingCount: sBookings.length, avgOccupancy: sBookings.length > 0 ? (sBookings.reduce((s, b) => s + b.nights, 0) / 90) * 100 : 0, multiplier: avgNightlyRate > 0 ? sAvg / avgNightlyRate : 1 };
  });

  const compPrices = propCompetitors.map(c => c.base_price).filter(p => p > 0);
  const competitorAvgPrice = compPrices.length > 0 ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length : null;
  let pricePosition = "unknown";
  if (competitorAvgPrice !== null && avgNightlyRate > 0) {
    const diff = avgNightlyRate / competitorAvgPrice;
    if (diff < 0.9) pricePosition = "below market";
    else if (diff > 1.1) pricePosition = "above market";
    else pricePosition = "at market";
  }

  const recommendations = generateRecommendations(avgNightlyRate, avgWeekdayRate, avgWeekendRate, seasonalTrends, competitorAvgPrice, seasonalRules);

  return {
    propertyId, avgNightlyRate: round(avgNightlyRate), medianNightlyRate: round(medianNightlyRate),
    minRate: round(minRate), maxRate: round(maxRate), totalBookings: propBookings.length,
    totalNights, totalRevenue: round(totalRevenue), avgOccupancyPercent: round(avgOccupancyPercent),
    avgWeekdayRate: round(avgWeekdayRate), avgWeekendRate: round(avgWeekendRate),
    avgWeeklyRate: round(avgWeeklyRate), avgMonthlyRate: round(avgMonthlyRate),
    seasonalTrends, monthlyBreakdown, recommendations,
    competitorAvgPrice: competitorAvgPrice ? round(competitorAvgPrice) : null,
    competitorCount: propCompetitors.length, pricePosition,
  };
}

function generateRecommendations(baseRate: number, weekdayRate: number, weekendRate: number, seasonalTrends: SeasonalTrend[], competitorAvg: number | null, seasonalRules: SeasonalRule[]): PriceRecommendation[] {
  const recs: PriceRecommendation[] = [];
  const today = new Date();

  for (let i = 0; i < 90; i++) {
    const date = new Date(today); date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const dow = date.getDay(); const month = date.getMonth(); const dayOfMonth = date.getDate();
    const weekend = WEEKEND_DAYS.includes(dow);
    const season = determineSeason(month);

    let rate = weekend ? weekendRate : weekdayRate;
    if (rate === 0) rate = baseRate;

    const seasonData = seasonalTrends.find(s => s.season === season);
    let seasonMultiplier = seasonData ? seasonData.multiplier : 1;

    const customRule = seasonalRules.find(r => {
      const startDate = new Date(2026, r.start_month - 1, r.start_day);
      const endDate = new Date(2026, r.end_month - 1, r.end_day);
      const checkDate = new Date(2026, month, dayOfMonth);
      return checkDate >= startDate && checkDate <= endDate;
    });
    if (customRule) seasonMultiplier = customRule.price_multiplier;

    let recommended = rate * seasonMultiplier;
    if (competitorAvg !== null && competitorAvg > 0) {
      const targetVsComp = competitorAvg * 0.95;
      recommended = recommended * 0.7 + targetVsComp * 0.3;
    }
    recommended = Math.round(recommended / 5) * 5;

    let confidence = 50;
    if (baseRate > 0) confidence += 20;
    if (competitorAvg) confidence += 15;
    if (seasonData && seasonData.bookingCount > 3) confidence += 15;

    const reasons: string[] = [];
    if (weekend) reasons.push("Weekend premium applied");
    if (seasonMultiplier > 1.05) reasons.push(season + " season (++" + Math.round((seasonMultiplier - 1) * 100) + "%)");
    if (seasonMultiplier < 0.95) reasons.push(season + " season (--" + Math.round((1 - seasonMultiplier) * 100) + "%)");
    if (competitorAvg) reasons.push("Competitor avg: $" + Math.round(competitorAvg));
    if (customRule) reasons.push("Custom rule: " + customRule.name);
    if (reasons.length === 0) reasons.push("Based on historical average");

    recs.push({ date: dateStr, baseRate: round(rate), seasonalAdjustment: round(rate * seasonMultiplier - rate), competitorRate: competitorAvg ? round(competitorAvg) : null, recommendedRate: Math.max(recommended, 25), dayOfWeek: dow, isWeekend: weekend, season, confidence: Math.min(100, confidence), reasoning: reasons.join(". ") });
  }
  return recs;
}

export function getSuggestedRates(analysis: PricingAnalysis) {
  const base = analysis.avgNightlyRate || 100;
  return {
    nightly: { weekday: round(analysis.avgWeekdayRate || base), weekend: round(analysis.avgWeekendRate || base * 1.15) },
    weekly: round((analysis.avgWeeklyRate || base * 0.9) * 7),
    monthly: round((analysis.avgMonthlyRate || base * 0.75) * 30),
    perNightEquivalent: { weekly: round(analysis.avgWeeklyRate || base * 0.9), monthly: round(analysis.avgMonthlyRate || base * 0.75) },
  };
}

function round(n: number): number { return Math.round(n * 100) / 100; }

export async function fetchBookingHistory(propertyId: string): Promise<BookingRecord[]> {
  const { data, error } = await supabase.from("booking_history").select("*").eq("property_id", propertyId).order("check_in", { ascending: false });
  if (error) { console.error("Fetch bookings error:", error); return []; }
  return data || [];
}

export async function fetchCompetitors(propertyId: string): Promise<CompetitorListing[]> {
  const { data, error } = await supabase.from("competitor_listings").select("*").eq("property_id", propertyId);
  if (error) { console.error("Fetch competitors error:", error); return []; }
  return data || [];
}

export async function fetchSeasonalRules(propertyId: string): Promise<SeasonalRule[]> {
  const { data, error } = await supabase.from("seasonal_rules").select("*").eq("property_id", propertyId);
  if (error) { console.error("Fetch seasonal rules error:", error); return []; }
  return data || [];
}

export async function saveRecommendation(propertyId: string, rec: PriceRecommendation): Promise<void> {
  await supabase.from("price_recommendations").upsert({
    property_id: propertyId, recommended_date: rec.date, base_rate: rec.baseRate,
    seasonal_adjustment: rec.seasonalAdjustment, competitor_rate: rec.competitorRate,
    recommended_rate: rec.recommendedRate, day_of_week: rec.dayOfWeek, is_weekend: rec.isWeekend,
    season: rec.season, confidence: rec.confidence, reasoning: rec.reasoning,
  }, { onConflict: "property_id,recommended_date" });
}

export async function addBookingRecord(booking: Omit<BookingRecord, "id" | "nights">): Promise<void> {
  const { error } = await supabase.from("booking_history").insert(booking);
  if (error) console.error("Add booking error:", error);
}
