// src/lib/booking-lifecycle.ts
//
// Sprint F — derive a booking's "where in its lifecycle" status from its
// dates + cancellation flag. Used by the calendar bar styling, the
// dashboard "what's happening today" widgets, and event scheduling
// (so the cron knows to skip events for cancelled bookings).
//
// Pure function — no DB. The cron / API code computes this on read.

export type LifecycleStatus =
  | "upcoming"
  | "arriving_soon"
  | "in_stay"
  | "departing"
  | "turnover"
  | "completed"
  | "cancelled";

export function computeLifecycleStatus(
  booking: { checkin_date: string; checkout_date: string; status?: string },
  today: Date = new Date()
): LifecycleStatus {
  if (booking.status === "cancelled") return "cancelled";

  const todayStr = isoDate(today);
  const checkin = booking.checkin_date;
  const checkout = booking.checkout_date;

  // iCal-style checkout_date is the morning of departure (exclusive). If
  // today is past that point, the booking is over — though we keep a
  // 2-day grace window labelled "turnover" so the host can see "the
  // cleaner is about to arrive" type cues without immediately flipping
  // the card to grey-completed.
  if (todayStr > checkout) {
    const diff = daysBetween(checkout, todayStr);
    if (diff <= 2) return "turnover";
    return "completed";
  }
  if (todayStr === checkout) return "departing";
  if (todayStr >= checkin && todayStr < checkout) return "in_stay";

  const daysUntilCheckin = daysBetween(todayStr, checkin);
  if (daysUntilCheckin <= 7) return "arriving_soon";
  return "upcoming";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z");
  const to = new Date(toIso + "T00:00:00Z");
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
