// src/lib/ical-sync.ts
//
// Sprint E — iCal sync for the bookings table.
//
// Pulls feeds configured in properties.ical_feeds[], parses each VEVENT,
// and upserts a row in `bookings` keyed by (property_id, ical_uid). After
// each successful sync the matching feed entry's last_synced_at gets
// stamped. iCal's DTEND is exclusive (checkout-day morning) so dates are
// stored as-is and the calendar UI handles the "occupied < checkout"
// rendering.
//
// Server-only (uses supabaseAdmin + node-ical).
//
// node-ical is dynamic-imported inside the sync functions because it
// triggers a TypeError ("o.BigInt is not a function") when Next.js does
// its build-time module evaluation pass. Deferring the import to call
// time avoids that — the module only loads when a sync actually runs.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { IcalFeed } from "@/lib/supabase";

export type SyncResult = {
  property_id: string;
  feed_url: string;
  platform: string;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: string[];
};

/** Fetch + parse a single iCal feed; upsert bookings; stamp last_synced_at. */
export async function syncIcalFeed(
  propertyId: string,
  feed: IcalFeed
): Promise<SyncResult> {
  const result: SyncResult = {
    property_id: propertyId,
    feed_url: feed.url,
    platform: feed.platform,
    fetched: 0,
    upserted: 0,
    skipped: 0,
    errors: [],
  };

  let events: Record<string, unknown>;
  try {
    // Lazy-import to avoid build-time eval blowup on node-ical.
    const icalMod = (await import("node-ical")) as {
      async: { fromURL: (url: string) => Promise<Record<string, unknown>> };
      default?: {
        async: {
          fromURL: (url: string) => Promise<Record<string, unknown>>;
        };
      };
    };
    const ical = icalMod.default || icalMod;
    events = await ical.async.fromURL(feed.url);
  } catch (err) {
    result.errors.push(`fetch failed: ${String(err)}`);
    return result;
  }

  for (const key of Object.keys(events)) {
    const ev = events[key] as {
      type?: string;
      uid?: string;
      summary?: string;
      start?: Date;
      end?: Date;
    };
    if (!ev || ev.type !== "VEVENT") continue;
    result.fetched++;

    if (!ev.uid) {
      result.errors.push("event missing uid");
      result.skipped++;
      continue;
    }
    if (!ev.start || !ev.end) {
      result.errors.push(`event ${ev.uid} missing dates`);
      result.skipped++;
      continue;
    }

    const summaryRaw = (ev.summary || "").toString();
    const summaryLower = summaryRaw.toLowerCase();
    const isBlocked =
      summaryLower.includes("not available") ||
      summaryLower.includes("blocked") ||
      summaryLower === "airbnb (not available)";
    const status = isBlocked ? "blocked" : "confirmed";

    const checkinDate = formatDate(ev.start);
    const checkoutDate = formatDate(ev.end);

    const { error } = await supabaseAdmin.from("bookings").upsert(
      {
        property_id: propertyId,
        ical_uid: ev.uid,
        source: feed.platform,
        status,
        checkin_date: checkinDate,
        checkout_date: checkoutDate,
        summary: summaryRaw || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,ical_uid", ignoreDuplicates: false }
    );

    if (error) {
      result.errors.push(`upsert ${ev.uid}: ${error.message}`);
    } else {
      result.upserted++;
    }
  }

  // Stamp last_synced_at on the matching feed entry.
  try {
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("ical_feeds")
      .eq("id", propertyId)
      .maybeSingle();
    if (prop?.ical_feeds) {
      const feeds = (prop.ical_feeds as IcalFeed[]).map((f) =>
        f.url === feed.url
          ? { ...f, last_synced_at: new Date().toISOString() }
          : f
      );
      await supabaseAdmin
        .from("properties")
        .update({ ical_feeds: feeds })
        .eq("id", propertyId);
    }
  } catch (e) {
    result.errors.push(`stamp last_synced_at: ${String(e)}`);
  }

  return result;
}

/** Iterate every property + every feed; sync each. */
export async function syncAllFeeds(): Promise<SyncResult[]> {
  const { data: properties } = await supabaseAdmin
    .from("properties")
    .select("id, ical_feeds");
  if (!properties) return [];

  const results: SyncResult[] = [];
  for (const prop of properties) {
    const feeds = (prop.ical_feeds || []) as IcalFeed[];
    for (const feed of feeds) {
      if (!feed?.url) continue;
      results.push(await syncIcalFeed(prop.id as string, feed));
    }
  }
  return results;
}

function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
