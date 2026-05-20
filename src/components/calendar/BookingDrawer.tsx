// src/components/calendar/BookingDrawer.tsx
//
// Sprint E — slide-in detail panel for a single booking. Shared between
// the per-property month grid and the portfolio timeline. Mirrors the
// PropertyCard CardSidePanel pattern from earlier sprints.

"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";
import { supabase } from "@/lib/supabase";
import type { Booking } from "@/lib/supabase";

export function BookingDrawer({
  booking,
  propertyName,
  onClose,
  onUpdated,
}: {
  booking: Booking;
  propertyName?: string;
  onClose: () => void;
  /** Called after a successful field update so the parent re-fetches. */
  onUpdated?: () => Promise<void> | void;
}) {
  // Optimistic local copy of the guest name so the drawer header reflects
  // edits immediately without waiting for the parent to refetch.
  const [guestName, setGuestName] = useState<string | null>(
    booking.guest_name
  );
  useEffect(() => {
    setGuestName(booking.guest_name);
  }, [booking.id, booking.guest_name]);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(guestName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const startEditName = () => {
    setNameDraft(guestName || "");
    setNameError(null);
    setEditingName(true);
  };
  const cancelEditName = () => {
    setEditingName(false);
    setNameError(null);
  };
  const saveName = async () => {
    setSavingName(true);
    setNameError(null);
    const next = nameDraft.trim() || null;
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ guest_name: next, updated_at: new Date().toISOString() })
        .eq("id", booking.id);
      if (error) {
        setNameError(error.message);
        return;
      }
      setGuestName(next);
      setEditingName(false);
      if (onUpdated) await onUpdated();
    } catch (e) {
      setNameError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  };
  const nights = Math.max(
    1,
    Math.round(
      (new Date(booking.checkout_date).getTime() -
        new Date(booking.checkin_date).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  const isBlocked = booking.status === "blocked";

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <Icon
              name={isBlocked ? "block" : "event_available"}
              className={clsx(
                "text-xl",
                isBlocked ? "text-txt-tertiary" : "text-brand"
              )}
            />
            <h3 className="text-lg font-extrabold truncate">
              {isBlocked
                ? "Blocked dates"
                : guestName || booking.summary || "Reservation"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt cursor-pointer flex-shrink-0"
            aria-label="Close"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm">
          {propertyName && (
            <Row label="Property">
              <span className="text-txt font-semibold">{propertyName}</span>
            </Row>
          )}
          {!isBlocked && (
            <Row label="Guest name">
              {editingName ? (
                <div className="flex items-center gap-1 justify-end">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="e.g. Katie"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") cancelEditName();
                    }}
                    className="flex-1 px-2 py-1 bg-white border border-surface-muted rounded text-xs outline-none focus:border-brand"
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded bg-brand text-white hover:bg-brand-dark disabled:opacity-50 cursor-pointer"
                  >
                    {savingName ? "…" : "Save"}
                  </button>
                  <button
                    onClick={cancelEditName}
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border border-surface-muted text-txt-secondary hover:border-txt-secondary cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-2 justify-end">
                  <span className="text-txt font-semibold">
                    {guestName || (
                      <em className="text-txt-tertiary font-normal">
                        — not set —
                      </em>
                    )}
                  </span>
                  <button
                    onClick={startEditName}
                    className="text-[10px] font-bold uppercase tracking-wide text-brand hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </span>
              )}
            </Row>
          )}
          {nameError && (
            <p className="text-[11px] text-status-red font-semibold -mt-2">
              {nameError}
            </p>
          )}
          <Row label="Status">
            <span
              className={clsx(
                "inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded",
                booking.status === "confirmed"
                  ? "bg-status-green-bg text-status-green"
                  : booking.status === "blocked"
                  ? "bg-surface-soft text-txt-tertiary"
                  : "bg-status-red-bg text-status-red"
              )}
            >
              {booking.status}
            </span>
          </Row>
          <Row label="Source">
            <span className="text-txt">{booking.source}</span>
          </Row>
          <Row label="Check-in">
            <span className="text-txt">
              {fmtDate(booking.checkin_date)}
            </span>
          </Row>
          <Row label="Check-out">
            <span className="text-txt">
              {fmtDate(booking.checkout_date)}{" "}
              <span className="text-[10px] text-txt-tertiary">
                (departure morning)
              </span>
            </span>
          </Row>
          <Row label="Nights">
            <span className="text-txt">{nights}</span>
          </Row>

          {(booking.guest_phone || booking.guest_email) && (
            <Row label="Contact">
              <span className="text-txt">
                {booking.guest_phone || booking.guest_email}
              </span>
            </Row>
          )}

          {booking.total_paid !== null && (
            <Row label="Total paid">
              <span className="text-txt font-semibold">
                ${booking.total_paid?.toFixed(2)}
              </span>
            </Row>
          )}
          {booking.host_payout !== null && (
            <Row label="Host payout">
              <span className="text-status-green font-semibold">
                ${booking.host_payout?.toFixed(2)}
              </span>
            </Row>
          )}
          {booking.cleaning_fee !== null && (
            <Row label="Cleaning fee">
              <span className="text-txt">
                ${booking.cleaning_fee?.toFixed(2)}
              </span>
            </Row>
          )}
          {booking.guests_count !== null && (
            <Row label="Guests">
              <span className="text-txt">{booking.guests_count}</span>
            </Row>
          )}
          {booking.platform_booking_id && (
            <Row label="Booking ID">
              <span className="text-txt font-mono text-xs">
                {booking.platform_booking_id}
              </span>
            </Row>
          )}
          {booking.summary && booking.summary !== booking.guest_name && (
            <Row label="iCal summary">
              <span className="text-txt-secondary text-xs italic">
                {booking.summary}
              </span>
            </Row>
          )}

          <div className="pt-3 mt-3 border-t border-surface-muted">
            <p className="text-[11px] text-txt-tertiary leading-relaxed">
              <strong>Workflow integration coming soon.</strong> Once Sprint
              D ships, you&apos;ll be able to view this booking&apos;s
              workflow steps and run them inline from here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary w-32 flex-shrink-0">
        {label}
      </span>
      <span className="text-right flex-1">{children}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z"); // noon UTC to avoid TZ off-by-one
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
