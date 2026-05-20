// src/components/booking/EventDetailDrawer.tsx
//
// Sprint F — slide-in panel for one booking_event. Read-only display
// of the resolved message + variable substitutions + audit info, plus
// quick actions (skip, fire-now stub). Used from the calendar event
// dots and the booking detail page timeline.

"use client";

import { useState } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";

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

export function EventDetailDrawer({
  event,
  onClose,
  onUpdated,
}: {
  event: BookingEventRow;
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepLabel = STEP_LABEL[event.step_id] || event.step_id;
  const icon = STEP_ICON[event.step_id] || "⚡";
  const statusBadge =
    STATUS_BADGE[event.status] || "bg-surface-soft text-txt-secondary";

  const message =
    (event.payload?.message as string) ||
    (event.payload?.message_to_guest as string) ||
    (event.payload?.message_to_cleaner as string) ||
    "";
  const summary = (event.payload?.summary as string) || "";
  const channel = (event.payload?.channel as string) || "—";
  const recipient = (event.payload?.recipient_role as string) || "—";
  const variables = (event.payload?.variables_resolved as Record<string, string>) || {};

  const skipEvent = async () => {
    setBusy("skip");
    setError(null);
    setToast(null);
    try {
      const r = await fetch(`/api/booking-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "skipped" }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `Skip failed (${r.status})`);
        return;
      }
      setToast("Event marked as skipped.");
      if (onUpdated) await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fireNow = async () => {
    setBusy("fire");
    setError(null);
    setTimeout(() => {
      setToast(
        "Fire-now will wire up in Sprint G — Telegram dispatch + variable resolution at send time."
      );
      setBusy(null);
    }, 200);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="text-2xl leading-none mt-0.5 flex-shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold leading-snug truncate">
                {stepLabel}
              </h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                {fmtTimestamp(event.scheduled_at)}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span
                  className={clsx(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border",
                    statusBadge
                  )}
                >
                  {event.status}
                </span>
                {channel !== "—" && (
                  <span className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wide">
                    {channel} → {recipient}
                  </span>
                )}
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
          {summary && (
            <Section label="Summary">
              <p className="text-sm text-txt leading-relaxed">{summary}</p>
            </Section>
          )}

          {message && (
            <Section label="Message">
              <pre className="text-[11px] font-mono leading-relaxed text-txt bg-surface-soft/40 border border-surface-muted rounded-lg p-3 whitespace-pre-wrap">
                <HighlightVars text={message} />
              </pre>
            </Section>
          )}

          {Object.keys(variables).length > 0 && (
            <Section label="Variables resolved">
              <div className="rounded-lg border border-surface-muted bg-white overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody>
                    {Object.entries(variables).map(([k, v]) => (
                      <tr
                        key={k}
                        className="border-b border-surface-muted last:border-b-0"
                      >
                        <td className="px-2 py-1.5 font-mono text-txt-secondary bg-surface-soft/30 w-1/2">
                          {`{{${k}}}`}
                        </td>
                        <td className="px-2 py-1.5 text-txt break-all">
                          {v || (
                            <em className="text-txt-tertiary">
                              — unresolved —
                            </em>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section label="Audit">
            <div className="text-xs text-txt-secondary space-y-1">
              {event.fired_at && (
                <p>
                  <strong>Fired:</strong> {fmtTimestamp(event.fired_at)}
                </p>
              )}
              {event.completed_at && (
                <p>
                  <strong>Completed:</strong>{" "}
                  {fmtTimestamp(event.completed_at)}
                </p>
              )}
              <p>
                <strong>Source:</strong> {event.source || "auto"}
              </p>
              {event.notes && (
                <p>
                  <strong>Notes:</strong> {event.notes}
                </p>
              )}
            </div>
          </Section>

          {toast && (
            <div className="rounded-lg border border-status-green/30 bg-status-green-bg/50 px-3 py-2 text-xs text-status-green font-semibold">
              ✓ {toast}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold">
              ⚠ {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-surface-muted">
            {event.status === "pending" && (
              <>
                <Button onClick={fireNow} disabled={!!busy}>
                  {busy === "fire" ? "…" : "▶ Fire now"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={skipEvent}
                  disabled={!!busy}
                >
                  {busy === "skip" ? "…" : "Skip"}
                </Button>
              </>
            )}
            <a
              href={`/booking/${event.booking_id}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline px-2 py-1.5"
            >
              <Icon name="open_in_new" className="text-sm" />
              View booking timeline
            </a>
          </div>

          {event.status === "pending" && (
            <p className="text-[11px] text-txt-tertiary leading-relaxed">
              Sprint G will fire pending events on a cron + Telegram
              approval loop. For now this drawer is a preview of what
              will be sent at scheduled_at.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary mb-1.5">
        {label}
      </p>
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
            className="bg-brand/10 text-brand px-1 rounded"
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

function fmtTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const abs = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const rel = formatDistanceToNow(d, { addSuffix: true });
    return `${abs} · ${rel}`;
  } catch {
    return iso;
  }
}
