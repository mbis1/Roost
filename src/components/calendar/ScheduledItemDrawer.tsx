// src/components/calendar/ScheduledItemDrawer.tsx
//
// Slide-in panel that opens when the user clicks a task or event chip
// on the calendar. Read-only details for now — "Run this now" and
// "Mark as done" actions are planned but deferred.

"use client";

import { Icon } from "@/components/Icon";
import type { Booking } from "@/lib/supabase";
import type { ScheduledItem } from "@/lib/calendar-utils";

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

function formatDate(iso: string): string {
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

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
                {formatDate(item.iso)}
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

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          <section>
            <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary mb-1.5">
              What
            </p>
            <p className="text-sm text-txt leading-relaxed">{item.label}</p>
          </section>

          {booking && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary mb-1.5">
                Related booking
              </p>
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
              </div>
            </section>
          )}

          {item.step_id && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary mb-1.5">
                Workflow step
              </p>
              <p className="text-xs font-mono text-txt-secondary bg-surface-soft px-2 py-1 rounded inline-block">
                {item.step_id}
              </p>
              <p className="text-[11px] text-txt-tertiary mt-1.5 leading-relaxed">
                Configure this step&apos;s template and execution mode in the
                Workflow tab.
              </p>
            </section>
          )}

          <section className="pt-3 border-t border-surface-muted">
            <p className="text-[11px] text-txt-tertiary italic leading-relaxed">
              <strong className="text-txt-secondary">Coming soon:</strong>{" "}
              Run this task now (fires the workflow run + Telegram approval
              loop) · Mark as done · Snooze · Skip for this booking.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
