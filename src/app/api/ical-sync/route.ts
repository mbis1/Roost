// src/app/api/ical-sync/route.ts
//
// Sprint E — sync iCal feeds. Two modes:
//   GET/POST /api/ical-sync                    sync ALL properties' feeds
//   GET/POST /api/ical-sync?property_id=<id>   sync just one property
//
// Use the all-properties form from a cron-job.org schedule. Use the
// single-property form from the UI ("Sync now" button on the Listings &
// Calendar Sync card).

import { NextResponse } from "next/server";
import { syncAllFeeds, syncIcalFeed } from "@/lib/ical-sync";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { IcalFeed } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const url = new URL(request.url);
  const propertyId = url.searchParams.get("property_id");

  try {
    if (propertyId) {
      const { data: prop, error } = await supabaseAdmin
        .from("properties")
        .select("id, ical_feeds")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
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
      const results = [];
      for (const feed of feeds) {
        if (!feed?.url) continue;
        results.push(await syncIcalFeed(prop.id as string, feed));
      }
      return NextResponse.json({
        ok: true,
        property_id: prop.id,
        feeds_synced: results.length,
        results,
      });
    }

    const results = await syncAllFeeds();
    return NextResponse.json({
      ok: true,
      feeds_synced: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
