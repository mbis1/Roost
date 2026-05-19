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
// Previously this used node-ical, which kept blowing up at runtime with
// "TypeError: o.BigInt is not a function" — its rrule dependency couldn't
// survive Vercel's bundling. Airbnb / VRBO / Booking iCal exports have
// none of the features that justify a heavyweight parser (no recurrence,
// no timezones, no alarms), so we parse them ourselves.

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

type VEvent = {
  uid: string;
  summary: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

/* ------------------------------------------------------------------ */
/* Tiny iCal parser                                                   */
/* ------------------------------------------------------------------ */

/** RFC 5545 line unfolding: CRLF followed by space/tab continues the prior
 *  line. Most short-term-rental platforms don't fold, but it's cheap to
 *  handle correctly. */
function unfoldLines(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.substring(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parse `KEY[;PARAM=VAL;…]:VALUE` into its three pieces. Params dropped
 *  for our use case; we only need the key + value. */
function splitKeyValue(line: string): { key: string; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return { key: "", value: "" };
  const left = line.substring(0, colonIdx);
  const value = line.substring(colonIdx + 1);
  const semi = left.indexOf(";");
  const key = semi < 0 ? left : left.substring(0, semi);
  return { key: key.toUpperCase(), value };
}

/** Accept YYYYMMDD (all-day) or YYYYMMDDTHHMMSS[Z]; return YYYY-MM-DD or
 *  null if unparseable. */
function parseIcsDate(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export async function parseIcsFeed(url: string): Promise<VEvent[]> {
  const res = await fetch(url, {
    // Some hosts gate on User-Agent; Airbnb's iCal endpoint is happy with
    // any UA but spell something out anyway.
    headers: { "User-Agent": "Roost/1.0 (calendar sync)" },
    // Don't cache the iCal body — we want fresh data every sync.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();

  const events: VEvent[] = [];
  const lines = unfoldLines(text);
  let inEvent = false;
  let current: Partial<VEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (trimmed === "END:VEVENT") {
      inEvent = false;
      if (current.uid && current.start && current.end) {
        events.push({
          uid: current.uid,
          summary: current.summary || "",
          start: current.start,
          end: current.end,
        });
      }
      current = {};
      continue;
    }
    if (!inEvent) continue;

    const { key, value } = splitKeyValue(line);
    switch (key) {
      case "UID":
        current.uid = value;
        break;
      case "SUMMARY":
        current.summary = unescapeIcsText(value);
        break;
      case "DTSTART":
        current.start = parseIcsDate(value) || undefined;
        break;
      case "DTEND":
        current.end = parseIcsDate(value) || undefined;
        break;
    }
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* Sync orchestration                                                 */
/* ------------------------------------------------------------------ */

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

  let events: VEvent[];
  try {
    events = await parseIcsFeed(feed.url);
  } catch (err) {
    result.errors.push(`fetch failed: ${String(err)}`);
    return result;
  }

  for (const ev of events) {
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

    const summaryRaw = ev.summary;
    const summaryLower = summaryRaw.toLowerCase();
    const isBlocked =
      summaryLower.includes("not available") ||
      summaryLower.includes("blocked") ||
      summaryLower === "airbnb (not available)";
    const status = isBlocked ? "blocked" : "confirmed";

    const { error } = await supabaseAdmin.from("bookings").upsert(
      {
        property_id: propertyId,
        ical_uid: ev.uid,
        source: feed.platform,
        status,
        checkin_date: ev.start,
        checkout_date: ev.end,
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
