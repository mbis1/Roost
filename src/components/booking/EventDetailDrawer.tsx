// src/components/booking/EventDetailDrawer.tsx
//
// Sprint F.1 — full event detail drawer.
//
// Layout (top → bottom):
//   1. Header   — step icon + title + close
//   2. Status   — status badge | absolute time · relative time | channel | recipient
//   3. Summary  — bold one-liner
//   4. Message  — monospaced pre-wrap block with {{var}} highlighted in pink
//   5. Variables resolved — collapsible (default closed), 2-col table
//   6. Related booking — guest, dates, nights, source, "View timeline" link
//   7. Actions  — Skip · Mark as done · Run now (disabled with tooltip)
//   8. History  — preformatted notes box, only if notes is non-empty

"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";

export type BookingEventRow = {
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

type BookingRow = {
  id: string;
  guest_name: string | null;
  summary: string | null;
  checkin_date: string;
  checkout_date: string;
  status: string;
  source: string | null;
};

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

const CHANNEL_BADGE: Record<string, string> = {
  telegram: "bg-status-blue-bg text-status-blue border-status-blue/40",
  email: "bg-status-orange-bg text-status-orange border-status-orange/40",
  sms: "bg-status-orange-bg text-status-orange border-status-orange/40",
  airbnb: "bg-status-green-bg text-status-green border-status-green/40",
  vrbo: "bg-status-green-bg text-status-green border-status-green/40",
  calendar_only: "bg-surface-soft text-txt-tertiary border-surface-muted",
};

export function EventDetailDrawer({
  event,
  onClose,
  onUpdated,
}: {
  event: BookingEventRow;
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"skip" | "complete" | "fire" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fireToast, setFireToast] = useState<string | null>(null);
  const [varsOpen, setVarsOpen] = useState(false);

  /* --------- Related booking (fetched on mount) --------- */
  const [booking, setBooking] = useState<BookingRow | null>(null);
  useEffect(() => {
    let alive = true;
    if (!event.booking_id) {
      setBooking(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, summary, checkin_date, checkout_date, status, source")
        .eq("id", event.booking_id)
        .maybeSingle();
      if (alive) setBooking((data as BookingRow | null) || null);
    })();
    return () => {
      alive = false;
    };
  }, [event.booking_id]);

  /* --------- Derived display data --------- */
  const stepLabel = STEP_LABEL[event.step_id] || event.step_id;
  const icon = STEP_ICON[event.step_id] || "⚡";
  const statusBadge =
    STATUS_BADGE[event.status] || "bg-surface-soft text-txt-secondary border-surface-muted";

  const message =
    (event.payload?.message as string) ||
    (event.payload?.message_to_guest as string) ||
    (event.payload?.message_to_cleaner as string) ||
    "";
  const summary = (event.payload?.summary as string) || "";
  const channel = (event.payload?.channel as string) || "";
  const recipient = (event.payload?.recipient_role as string) || "";
  const variables =
    (event.payload?.variables_resolved as Record<string, string>) || {};
  const variableEntries = Object.entries(variables);

  /* --------- Actions --------- */
  const skipEvent = async () => {
    setBusy("skip");
    setError(null);
    try {
      const r = await fetch(`/api/booking-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "skipped" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `Skip failed (${r.status})`);
        return;
      }
      if (onUpdated) await onUpdated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const completeEvent = async () => {
    setBusy("complete");
    setError(null);
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
        setError(j.error || `Mark-done failed (${r.status})`);
        return;
      }
      if (onUpdated) await onUpdated();
      // Per spec: refresh but don't close.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** Sprint G — fire this event to Telegram via the executor. */
  const fireNow = async () => {
    setBusy("fire");
    setError(null);
    setFireToast(null);
    try {
      const r = await fetch(`/api/booking-events/${event.id}/fire`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        const reason = j.reason || j.error || `HTTP ${r.status}`;
        setError(`Run failed: ${reason}`);
        return;
      }
      setFireToast(
        `Fired to Telegram${
          j.telegram_message_id ? ` (msg #${j.telegram_message_id})` : ""
        }. Check your phone.`
      );
      if (onUpdated) await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /* --------- Render --------- */
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="text-2xl leading-none mt-0.5 flex-shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold leading-snug truncate">
                {stepLabel}
              </h3>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-txt-tertiary mt-0.5">
                {event.step_id}
              </p>
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
          {/* 2. Status row */}
          <Section label="Status">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={clsx(
                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border",
                  statusBadge
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

          {/* 3. Summary */}
          {summary && (
            <Section label="Summary">
              <p className="text-sm font-bold text-txt leading-snug">
                {summary}
              </p>
            </Section>
          )}

          {/* 4. Message preview */}
          {message && (
            <Section label="Message">
              <pre
                className="text-[12px] font-mono leading-relaxed text-txt bg-surface-soft border border-surface-muted whitespace-pre-wrap"
                style={{
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <HighlightVars text={message} />
              </pre>
            </Section>
          )}

          {/* 5. Variables resolved — collapsible */}
          {variableEntries.length > 0 && (
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
                            {v ? (
                              v
                            ) : (
                              <em className="text-txt-tertiary not-italic">
                                <span className="italic">(not set)</span>
                              </em>
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

          {/* 6. Related booking */}
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
                  Source: {booking.source || "—"} · Status: {booking.status}
                </p>
                <a
                  href={`/booking/${booking.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline mt-2"
                >
                  <Icon name="timeline" className="text-sm" />
                  View timeline
                </a>
              </div>
            </Section>
          )}

          {/* Action toast / error surfaces */}
          {fireToast && (
            <div className="rounded-lg border border-status-green/30 bg-status-green-bg/50 px-3 py-2 text-xs text-status-green font-semibold">
              ✓ {fireToast}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold">
              ⚠ {error}
            </div>
          )}

          {/* 7. Actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-surface-muted">
            <button
              type="button"
              onClick={skipEvent}
              disabled={busy !== null || event.status === "skipped"}
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-muted bg-white text-txt-secondary transition-colors",
                busy !== null || event.status === "skipped"
                  ? "opacity-55 cursor-not-allowed"
                  : "hover:border-txt-secondary cursor-pointer"
              )}
            >
              {busy === "skip" ? "Skipping…" : "Skip for this booking"}
            </button>
            <button
              type="button"
              onClick={completeEvent}
              disabled={busy !== null || event.status === "completed"}
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                event.status === "completed"
                  ? "opacity-55 cursor-not-allowed bg-status-green-bg text-status-green border-status-green/40"
                  : busy !== null
                  ? "opacity-55 cursor-not-allowed bg-white text-status-green border-status-green/40"
                  : "bg-white text-status-green border-status-green/40 hover:bg-status-green-bg cursor-pointer"
              )}
            >
              {busy === "complete"
                ? "Marking…"
                : event.status === "completed"
                ? "✓ Done"
                : "Mark as done"}
            </button>
            <button
              type="button"
              onClick={fireNow}
              disabled={
                busy !== null ||
                event.status === "fired" ||
                event.status === "completed" ||
                event.status === "skipped"
              }
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1",
                busy !== null ||
                  event.status === "fired" ||
                  event.status === "completed" ||
                  event.status === "skipped"
                  ? "opacity-55 cursor-not-allowed bg-white text-brand border-brand/40"
                  : "bg-white text-brand border-brand/40 hover:bg-brand/10 cursor-pointer"
              )}
              title={
                event.status !== "pending"
                  ? `Status is ${event.status}; can only run pending events`
                  : "Send this event to Telegram now"
              }
            >
              {busy === "fire" ? "Firing…" : "▶ Run now"}
            </button>
          </div>

          {/* 8. History — only when notes is non-empty */}
          {event.notes && event.notes.trim() && (
            <Section label="History">
              <pre className="text-[11px] text-txt-secondary bg-surface-soft border border-surface-muted rounded-lg p-2.5 whitespace-pre-wrap font-mono leading-relaxed">
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
              borderRadius: 3,
              padding: "0 4px",
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

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(checkin + "T12:00:00Z").getTime();
  const b = new Date(checkout + "T12:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}
