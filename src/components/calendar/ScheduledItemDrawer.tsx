// src/components/calendar/ScheduledItemDrawer.tsx
//
// Sprint F.1 (retry) — full drawer rendering for whatever the user
// clicked on the calendar (task chip OR booking-derived event chip).
//
// The calendar API returns ScheduledItem (a lightweight projection:
// iso / category / step_id / booking_id). To render status + summary
// + message + variables we need the actual booking_event row that
// corresponds to this projection. We fetch /api/booking/[booking_id]/
// events on mount and match by step_id.
//
// For events that aren't backed by a booking_event row (Check-in,
// Check-out, Turnover — these are derived from booking dates, not
// from the workflow generator), the drawer degrades to a basic view:
// related booking + a note explaining there's no automation behind it.

"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import type { Booking } from "@/lib/supabase";
import type { ScheduledItem } from "@/lib/calendar-utils";

type BookingEventRow = {
  id: string;
  booking_id: string;
  property_id: string;
  step_id: string;
  scheduled_at: string;
  status: string; // pending | fired | completed | skipped | failed
  payload: Record<string, unknown>;
  fired_at: string | null;
  completed_at: string | null;
  notes: string | null;
  source: string | null;
  created_at: string | null;
};

function itemIcon(item: ScheduledItem): string {
  switch (item.category) {
    case "message":
      return "💬";
    case "ping":
      return "📲";
    case "lock":
      return "🔑";
    case "cleaner":
      return "🧹";
    case "checkin":
      return "🛬";
    case "checkout":
      return "🛫";
    case "turnover":
      return "🧽";
    default:
      return item.type === "event" ? "📅" : "⚡";
  }
}

function categoryLabel(item: ScheduledItem): string {
  switch (item.category) {
    case "message":
      return "Guest message";
    case "ping":
      return "Telegram ping";
    case "lock":
      return "Lock code update";
    case "cleaner":
      return "Cleaner notification";
    case "checkin":
      return "Guest check-in";
    case "checkout":
      return "Guest check-out";
    case "turnover":
      return "Turnover";
    default:
      return item.type === "event" ? "Event" : "Task";
  }
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(checkin + "T12:00:00Z").getTime();
  const b = new Date(checkout + "T12:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-status-orange-bg text-status-orange border-status-orange/40",
  fired: "bg-status-blue-bg text-status-blue border-status-blue/40",
  completed: "bg-status-green-bg text-status-green border-status-green/40",
  skipped: "bg-surface-soft text-txt-tertiary border-surface-muted",
  failed: "bg-status-red-bg text-status-red border-status-red/40",
};

const CHANNEL_BADGE: Record<string, string> = {
  telegram: "bg-status-blue-bg text-status-blue border-status-blue/40",
  email: "bg-status-orange-bg text-status-orange border-status-orange/40",
  sms: "bg-status-orange-bg text-status-orange border-status-orange/40",
  airbnb: "bg-status-green-bg text-status-green border-status-green/40",
  vrbo: "bg-status-green-bg text-status-green border-status-green/40",
  calendar_only: "bg-surface-soft text-txt-tertiary border-surface-muted",
};

export function ScheduledItemDrawer({
  item,
  booking,
  onClose,
}: {
  item: ScheduledItem;
  booking: Booking | null;
  onClose: () => void;
}) {
  const typeBadgeClass =
    item.type === "task"
      ? "bg-status-orange-bg text-status-orange border-status-orange/40"
      : "bg-status-blue-bg text-status-blue border-status-blue/40";

  /* --------- Fetch the backing booking_event, if any --------- */

  const [event, setEvent] = useState<BookingEventRow | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [fetchTick, setFetchTick] = useState(0); // refresh trigger after PATCH

  useEffect(() => {
    let alive = true;
    if (!item.booking_id || !item.step_id) {
      setEvent(null);
      setLoadingEvent(false);
      return () => {
        alive = false;
      };
    }
    setLoadingEvent(true);
    fetch(
      `/api/booking/${item.booking_id}/events?_t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const rows = (j.events || []) as BookingEventRow[];
        const match = rows.find((e) => e.step_id === item.step_id) || null;
        setEvent(match);
      })
      .catch(() => {
        if (alive) setEvent(null);
      })
      .finally(() => {
        if (alive) setLoadingEvent(false);
      });
    return () => {
      alive = false;
    };
  }, [item.booking_id, item.step_id, fetchTick]);

  /* --------- Action handlers --------- */

  const [busy, setBusy] = useState<"skip" | "complete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const skipEvent = async () => {
    if (!event) return;
    setBusy("skip");
    setActionError(null);
    try {
      const r = await fetch(`/api/booking-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "skipped" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setActionError(j.error || `Skip failed (${r.status})`);
        return;
      }
      // Per spec: refresh + close.
      onClose();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const completeEvent = async () => {
    if (!event) return;
    setBusy("complete");
    setActionError(null);
    try {
      const r = await fetch(`/api/booking-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setActionError(j.error || `Mark-done failed (${r.status})`);
        return;
      }
      // Per spec: refresh, no close. Re-fetch the event to update state.
      setFetchTick((n) => n + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /* --------- Derived event data --------- */

  const summary = (event?.payload?.summary as string) || "";
  const message =
    (event?.payload?.message as string) ||
    (event?.payload?.message_to_guest as string) ||
    (event?.payload?.message_to_cleaner as string) ||
    "";
  const channel = (event?.payload?.channel as string) || "";
  const recipient = (event?.payload?.recipient_role as string) || "";
  const variables =
    (event?.payload?.variables_resolved as Record<string, string>) || {};
  const variableEntries = Object.entries(variables);

  const [varsOpen, setVarsOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* (a) Header — kept as-is per spec */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="text-2xl leading-none mt-0.5 flex-shrink-0">
              {itemIcon(item)}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold leading-snug truncate">
                {categoryLabel(item)}
              </h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                {formatDateLong(item.iso)}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className={
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border " +
                    typeBadgeClass
                  }
                >
                  {item.type === "task" ? "Task" : "Event"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt cursor-pointer flex-shrink-0 ml-3"
            title="Close"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* (b) Status row */}
          {event ? (
            <Section label="Status">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={clsx(
                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border",
                    STATUS_BADGE[event.status] ||
                      "bg-surface-soft text-txt-secondary border-surface-muted"
                  )}
                >
                  {event.status}
                </span>
                <span className="text-xs text-txt-secondary">
                  {fmtAbsolute(event.scheduled_at)}
                  {" · "}
                  <span className="text-txt-tertiary">
                    {fmtRelative(event.scheduled_at)}
                  </span>
                </span>
                {channel && (
                  <span
                    className={clsx(
                      "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border",
                      CHANNEL_BADGE[channel] ||
                        "bg-surface-soft text-txt-secondary border-surface-muted"
                    )}
                  >
                    {channel.replace(/_/g, " ")}
                  </span>
                )}
                {recipient && (
                  <span className="text-[11px] text-txt-secondary">
                    → <span className="capitalize">{recipient}</span>
                  </span>
                )}
              </div>
            </Section>
          ) : (
            !loadingEvent && (
              <Section label="Status">
                <p className="text-xs text-txt-secondary leading-relaxed">
                  This item is a calendar projection derived from the booking
                  dates — there&apos;s no automated event behind it yet. If
                  this is a workflow step you expect to see scheduled, hit{" "}
                  <strong>Re-sync events</strong> on the booking page.
                </p>
              </Section>
            )
          )}

          {/* (c) Summary */}
          {event && summary && (
            <Section label="Summary">
              <p className="text-sm font-bold text-txt leading-snug">
                {summary}
              </p>
            </Section>
          )}

          {/* (d) Message preview */}
          {event && message && (
            <Section label="Message">
              <pre
                className="text-[12px] font-mono leading-relaxed text-txt whitespace-pre-wrap"
                style={{
                  backgroundColor: "var(--color-background-secondary, #F1EFE8)",
                  borderRadius: 8,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <HighlightVars text={message} />
              </pre>
            </Section>
          )}

          {/* (e) Variables resolved — collapsible, default collapsed */}
          {event && variableEntries.length > 0 && (
            <Section
              label={`Variables resolved (${variableEntries.length})`}
              actions={
                <button
                  type="button"
                  onClick={() => setVarsOpen((v) => !v)}
                  className="text-[10px] font-bold uppercase tracking-wide text-brand hover:underline cursor-pointer inline-flex items-center gap-0.5"
                >
                  <Icon
                    name={varsOpen ? "expand_less" : "expand_more"}
                    className="text-sm"
                  />
                  {varsOpen ? "Hide" : "Show"}
                </button>
              }
            >
              {varsOpen && (
                <div className="rounded-lg border border-surface-muted bg-white overflow-hidden">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {variableEntries.map(([k, v]) => (
                        <tr
                          key={k}
                          className="border-b border-surface-muted last:border-b-0"
                        >
                          <td className="px-2 py-1.5 font-mono text-txt-secondary bg-surface-soft/40 w-1/2 align-top">
                            {`{{${k}}}`}
                          </td>
                          <td className="px-2 py-1.5 text-txt break-all align-top">
                            {v && v.length > 0 ? (
                              v
                            ) : (
                              <span className="italic text-txt-tertiary">
                                (not set)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* Loading state for event fetch */}
          {loadingEvent && !event && (
            <p className="text-[11px] text-txt-tertiary italic">
              Loading event details…
            </p>
          )}

          {/* (f) Related booking card — kept as-is */}
          {booking && (
            <Section label="Related booking">
              <div className="rounded-xl border border-surface-muted bg-surface-soft/40 p-3">
                <p className="text-sm font-extrabold text-txt">
                  {booking.guest_name || booking.summary || "Reserved"}
                </p>
                <p className="text-xs text-txt-secondary mt-0.5">
                  {booking.checkin_date} → {booking.checkout_date} ·{" "}
                  {nightsBetween(booking.checkin_date, booking.checkout_date)}{" "}
                  nights
                </p>
                <p className="text-[11px] text-txt-tertiary mt-1 capitalize">
                  Source: {booking.source} · Status: {booking.status}
                </p>
                <a
                  href={`/booking/${booking.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline mt-2"
                >
                  <Icon name="timeline" className="text-sm" />
                  View full timeline
                </a>
              </div>
            </Section>
          )}

          {item.step_id && (
            <Section label="Workflow step">
              <p className="text-xs font-mono text-txt-secondary bg-surface-soft px-2 py-1 rounded inline-block">
                {item.step_id}
              </p>
            </Section>
          )}

          {/* Action error surface */}
          {actionError && (
            <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold">
              ⚠ {actionError}
            </div>
          )}

          {/* (g) Action buttons */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-surface-muted">
            <button
              type="button"
              onClick={skipEvent}
              disabled={
                !event || busy !== null || event.status === "skipped"
              }
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-muted bg-white text-txt-secondary transition-colors",
                !event || busy !== null || event.status === "skipped"
                  ? "opacity-55 cursor-not-allowed"
                  : "hover:border-txt-secondary cursor-pointer"
              )}
              title={
                !event
                  ? "No automated event behind this calendar item"
                  : event.status === "skipped"
                  ? "Already skipped"
                  : undefined
              }
            >
              {busy === "skip" ? "Skipping…" : "Skip for this booking"}
            </button>
            <button
              type="button"
              onClick={completeEvent}
              disabled={
                !event || busy !== null || event.status === "completed"
              }
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                event && event.status === "completed"
                  ? "opacity-55 cursor-not-allowed bg-status-green-bg text-status-green border-status-green/40"
                  : !event || busy !== null
                  ? "opacity-55 cursor-not-allowed bg-white text-status-green border-status-green/40"
                  : "bg-white text-status-green border-status-green/40 hover:bg-status-green-bg cursor-pointer"
              )}
              title={
                !event
                  ? "No automated event behind this calendar item"
                  : event.status === "completed"
                  ? "Already done"
                  : undefined
              }
            >
              {busy === "complete"
                ? "Marking…"
                : event && event.status === "completed"
                ? "✓ Done"
                : "Mark as done"}
            </button>
            <button
              type="button"
              disabled
              title="Wired up in Sprint G"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand/30 text-white border border-brand/30 opacity-55 cursor-not-allowed"
            >
              ▶ Run now
            </button>
          </div>

          {/* (h) History — only when notes is non-empty */}
          {event && event.notes && event.notes.trim() && (
            <Section label="History">
              <pre
                className="text-[11px] text-txt-secondary whitespace-pre-wrap font-mono leading-relaxed"
                style={{
                  backgroundColor: "var(--color-background-secondary, #F1EFE8)",
                  borderRadius: 8,
                  padding: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                {event.notes}
              </pre>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({
  label,
  actions,
  children,
}: {
  label: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary">
          {label}
        </p>
        {actions}
      </div>
      {children}
    </div>
  );
}

function HighlightVars({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{\w+\}\}$/.test(p) ? (
          <span
            key={i}
            style={{
              backgroundColor: "#FBEAF0",
              color: "#993556",
              padding: "0 4px",
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function fmtAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
