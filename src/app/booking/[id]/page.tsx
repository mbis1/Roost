// src/app/booking/[id]/page.tsx
//
// Sprint F — booking detail page. Header with guest + dates + lifecycle
// status, optional financial stats, then a vertical timeline of every
// booking_event ordered by scheduled_at. Click any event to open the
// EventDetailDrawer.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Booking } from "@/lib/supabase";
import {
  computeLifecycleStatus,
  type LifecycleStatus,
} from "@/lib/booking-lifecycle";
import {
  EventDetailDrawer,
  type BookingEventRow,
} from "@/components/booking/EventDetailDrawer";

const STEP_LABEL: Record<string, string> = {
  WELCOME_MESSAGE: "Welcome message",
  CLEANER_NOTIFY: "Notify cleaner",
  CLEANER_ARRIVES: "Cleaner arrives",
  LOCK_CODE_UPDATE: "Update lock code",
  CHECKOUT_REMINDER: "Checkout reminder",
  CONFIRM_TURNOVER: "Confirm turnover",
};

const STEP_ICON: Record<string, string> = {
  WELCOME_MESSAGE: "💬",
  CLEANER_NOTIFY: "📲",
  CLEANER_ARRIVES: "🧹",
  LOCK_CODE_UPDATE: "🔑",
  CHECKOUT_REMINDER: "📩",
  CONFIRM_TURNOVER: "✅",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-status-orange-bg text-status-orange border-status-orange/40",
  fired: "bg-status-blue-bg text-status-blue border-status-blue/40",
  completed: "bg-status-green-bg text-status-green border-status-green/40",
  skipped: "bg-surface-soft text-txt-tertiary border-surface-muted",
  failed: "bg-status-red-bg text-status-red border-status-red/40",
};

const LIFECYCLE_BADGE: Record<LifecycleStatus, string> = {
  upcoming: "bg-surface-soft text-txt-secondary border-surface-muted",
  arriving_soon: "bg-status-blue-bg text-status-blue border-status-blue/40",
  in_stay: "bg-brand/10 text-brand border-brand/40",
  departing: "bg-status-orange-bg text-status-orange border-status-orange/40",
  turnover: "bg-status-orange-bg text-status-orange border-status-orange/40",
  completed: "bg-surface-soft text-txt-tertiary border-surface-muted",
  cancelled: "bg-status-red-bg text-status-red border-status-red/40",
};

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = params?.id || "";

  const [booking, setBooking] = useState<Booking | null>(null);
  const [propertyName, setPropertyName] = useState<string>("");
  const [events, setEvents] = useState<BookingEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncReport, setResyncReport] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      // Booking row
      const { data: b, error: bErr } = await supabase
        .from("bookings")
        .select("*, properties(name, nickname)")
        .eq("id", bookingId)
        .maybeSingle();
      if (bErr) {
        setError(bErr.message);
        return;
      }
      if (!b) {
        setError("Booking not found");
        return;
      }
      setBooking(b as Booking);
      const props = (b as { properties?: { name?: string; nickname?: string } })
        .properties;
      setPropertyName(props?.nickname || props?.name || "");

      // Events
      const r = await fetch(`/api/booking/${bookingId}/events`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `Events fetch failed (${r.status})`);
      } else {
        setEvents((j.events || []) as BookingEventRow[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resync = async () => {
    setResyncing(true);
    setResyncReport(null);
    try {
      const r = await fetch(`/api/booking/${bookingId}/events`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Re-sync failed`);
      } else {
        setResyncReport(
          `+${j.created} new · ${j.updated} updated · ${j.deleted} removed`
        );
      }
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResyncing(false);
    }
  };

  if (loading && !booking) {
    return (
      <div className="p-6">
        <p className="text-txt-secondary text-sm">Loading booking…</p>
      </div>
    );
  }
  if (error && !booking) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-status-red font-semibold">
          ⚠ {error}
        </div>
      </div>
    );
  }
  if (!booking) {
    return null;
  }

  const lifecycle = computeLifecycleStatus(booking);
  const nights = Math.max(
    1,
    Math.round(
      (new Date(booking.checkout_date).getTime() -
        new Date(booking.checkin_date).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );
  const guestName = booking.guest_name || booking.summary || "Reserved";
  const openEvent = openEventId
    ? events.find((e) => e.id === openEventId) || null
    : null;

  return (
    <div className="min-h-screen bg-surface-soft p-5 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Top nav */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-txt-secondary hover:text-txt mb-4 cursor-pointer"
        >
          <Icon name="arrow_back" className="text-sm" />
          Back
        </button>

        {/* Header card */}
        <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold truncate">
                {guestName}
              </h1>
              <p className="text-sm text-txt-secondary mt-0.5">
                {propertyName ? `${propertyName} · ` : ""}
                {fmtDate(booking.checkin_date)} →{" "}
                {fmtDate(booking.checkout_date)} · {nights} nights
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span
                  className={clsx(
                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border",
                    LIFECYCLE_BADGE[lifecycle]
                  )}
                >
                  {lifecycle.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wide">
                  {booking.source} · {booking.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={resync}
                disabled={resyncing}
              >
                <span className="inline-flex items-center gap-1">
                  <Icon name="refresh" className="text-sm" />
                  {resyncing ? "Re-syncing…" : "Re-sync events"}
                </span>
              </Button>
              {booking.property_id && (
                <a
                  href={`/property/${booking.property_id}?tab=workflow`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline px-3 py-1.5 border border-surface-muted rounded-lg"
                >
                  <Icon name="account_tree" className="text-sm" />
                  Workflow
                </a>
              )}
            </div>
          </div>

          {/* Stats row */}
          {(booking.total_paid != null ||
            booking.host_payout != null ||
            booking.cleaning_fee != null ||
            booking.guests_count != null) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-surface-muted">
              {booking.total_paid != null && (
                <Stat
                  label="Total paid"
                  value={`$${booking.total_paid.toFixed(2)}`}
                />
              )}
              {booking.host_payout != null && (
                <Stat
                  label="Host payout"
                  value={`$${booking.host_payout.toFixed(2)}`}
                  emphasis
                />
              )}
              {booking.cleaning_fee != null && (
                <Stat
                  label="Cleaning"
                  value={`$${booking.cleaning_fee.toFixed(2)}`}
                />
              )}
              {booking.guests_count != null && (
                <Stat
                  label="Guests"
                  value={String(booking.guests_count)}
                />
              )}
            </div>
          )}

          {resyncReport && (
            <div className="mt-3 rounded-lg border border-status-green/30 bg-status-green-bg/50 px-3 py-2 text-xs text-status-green font-semibold">
              ✓ {resyncReport}
            </div>
          )}
          {error && booking && (
            <div className="mt-3 rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-extrabold">Event timeline</h2>
            <span className="text-xs text-txt-secondary">
              {events.length} event{events.length === 1 ? "" : "s"}
            </span>
          </div>
          {events.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-txt-secondary mb-2">
                No events scheduled yet.
              </p>
              <Button variant="ghost" size="sm" onClick={resync}>
                Generate events
              </Button>
            </div>
          ) : (
            <ol className="relative pl-5">
              {/* Vertical guideline */}
              <span
                className="absolute left-2 top-0 bottom-0 w-px bg-surface-muted"
                aria-hidden
              />
              {events.map((ev) => (
                <li key={ev.id} className="relative pb-4 last:pb-0">
                  <span
                    className={clsx(
                      "absolute -left-3.5 top-1 w-3 h-3 rounded-full border-2 border-white",
                      ev.status === "completed"
                        ? "bg-status-green"
                        : ev.status === "fired"
                        ? "bg-status-blue"
                        : ev.status === "skipped"
                        ? "bg-surface-muted"
                        : ev.status === "failed"
                        ? "bg-status-red"
                        : "bg-status-orange"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setOpenEventId(ev.id)}
                    className="block w-full text-left rounded-lg border border-surface-muted bg-white px-3 py-2 hover:border-brand hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg leading-none">
                            {STEP_ICON[ev.step_id] || "⚡"}
                          </span>
                          <h3 className="text-sm font-extrabold truncate">
                            {STEP_LABEL[ev.step_id] || ev.step_id}
                          </h3>
                          <span
                            className={clsx(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border",
                              STATUS_BADGE[ev.status] ||
                                "bg-surface-soft text-txt-secondary"
                            )}
                          >
                            {ev.status}
                          </span>
                        </div>
                        <p className="text-xs text-txt-secondary mt-0.5">
                          {fmtTimestamp(ev.scheduled_at)}
                        </p>
                        {(ev.payload?.summary as string) && (
                          <p className="text-xs text-txt mt-1 leading-relaxed">
                            {ev.payload.summary as string}
                          </p>
                        )}
                      </div>
                      <Icon
                        name="chevron_right"
                        className="text-base text-txt-tertiary"
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {openEvent && (
        <EventDetailDrawer
          event={openEvent}
          onClose={() => setOpenEventId(null)}
          onUpdated={fetchAll}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary">
        {label}
      </p>
      <p
        className={clsx(
          "text-base font-extrabold mt-0.5",
          emphasis ? "text-status-green" : "text-txt"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const abs = d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET";
    const rel = formatDistanceToNow(d, { addSuffix: true });
    return `${abs} · ${rel}`;
  } catch {
    return iso;
  }
}
