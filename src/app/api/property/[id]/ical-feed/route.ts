// src/app/api/property/[id]/ical-feed/route.ts
//
// Sprint E — manage the per-property iCal feeds list.
//
//   POST   /api/property/<id>/ical-feed
//          body: { platform: string, url: string }
//          → upserts the feed into properties.ical_feeds[] (replace if same
//            platform, else append) and triggers an immediate sync. Returns
//            the SyncResult.
//
//   DELETE /api/property/<id>/ical-feed?platform=airbnb
//          → removes that platform's feed entry. Bookings sourced from it
//            stay in the bookings table (no cascading delete).
//
// Server-only (supabaseAdmin).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncIcalFeed } from "@/lib/ical-sync";
import type { IcalFeed } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  let body: { platform?: string; url?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const platform = (body.platform || "").trim();
  const feedUrl = (body.url || "").trim();
  if (!platform || !feedUrl) {
    return NextResponse.json(
      { ok: false, error: "platform and url required" },
      { status: 400 }
    );
  }

  const { data: prop, error: readErr } = await supabaseAdmin
    .from("properties")
    .select("ical_feeds")
    .eq("id", params.id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { ok: false, error: readErr.message },
      { status: 500 }
    );
  }
  if (!prop) {
    return NextResponse.json(
      { ok: false, error: "Property not found" },
      { status: 404 }
    );
  }

  const feeds = (prop.ical_feeds || []) as IcalFeed[];
  const idx = feeds.findIndex(
    (f) => (f.platform || "").toLowerCase() === platform.toLowerCase()
  );
  const newFeed: IcalFeed = { platform, url: feedUrl, last_synced_at: null };
  if (idx >= 0) feeds[idx] = newFeed;
  else feeds.push(newFeed);

  const { error: updErr } = await supabaseAdmin
    .from("properties")
    .update({ ical_feeds: feeds })
    .eq("id", params.id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 }
    );
  }

  // Trigger immediate sync.
  const syncResult = await syncIcalFeed(params.id, newFeed);

  return NextResponse.json({ ok: true, sync_result: syncResult });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const platform = (url.searchParams.get("platform") || "").trim();
  if (!platform) {
    return NextResponse.json(
      { ok: false, error: "platform query param required" },
      { status: 400 }
    );
  }

  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("ical_feeds")
    .eq("id", params.id)
    .maybeSingle();
  if (!prop) {
    return NextResponse.json(
      { ok: false, error: "Property not found" },
      { status: 404 }
    );
  }

  const feeds = ((prop.ical_feeds || []) as IcalFeed[]).filter(
    (f) => (f.platform || "").toLowerCase() !== platform.toLowerCase()
  );

  const { error: updErr } = await supabaseAdmin
    .from("properties")
    .update({ ical_feeds: feeds })
    .eq("id", params.id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
