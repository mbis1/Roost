// src/lib/timezone.ts
//
// All Roost properties are in North Carolina, so every scheduled step
// ("checkout reminder at 8 AM", "cleaner ping at 11 AM") means 8 AM
// Eastern, not 8 AM UTC. These helpers turn a calendar date + wall-clock
// time in PROPERTY_TZ into the real UTC instant, handling EST/EDT.

export const PROPERTY_TZ = "America/New_York";

/** Offset of `tz` from UTC at the given instant, in minutes (EDT = -240). */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * "2026-11-03" + 8:00 in America/New_York → the UTC Date for that moment.
 * Two passes so the result is right on DST-change days.
 */
export function zonedTimeToUtc(
  dateIso: string,
  hour: number,
  minute = 0,
  tz: string = PROPERTY_TZ
): Date {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0);
  let offset = tzOffsetMinutes(new Date(naive), tz);
  let result = naive - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = naive - offset * 60000;
  }
  return new Date(result);
}

/** Format an ISO instant for display in the property's time zone, e.g. "Tue, Nov 3, 8:00 AM ET". */
export function formatPropertyTime(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
): string {
  const s = new Date(iso).toLocaleString("en-US", { ...opts, timeZone: PROPERTY_TZ });
  return `${s} ET`;
}
