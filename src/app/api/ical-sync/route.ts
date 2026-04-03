import { NextRequest, NextResponse } from "next/server";
import { fetchAndParseICal } from "@/lib/ical";

export async function POST(request: NextRequest) {
  try {
    const { url, platform } = await request.json();
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const events = await fetchAndParseICal(url, platform || "Unknown");
    return NextResponse.json({ success: true, events, count: events.length, synced_at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Failed to sync calendar", details: String(error) }, { status: 500 });
  }
}
