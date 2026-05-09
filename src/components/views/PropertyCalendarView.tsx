// src/components/views/PropertyCalendarView.tsx
//
// Sprint E — per-property month-grid calendar (Airbnb-style).
//
// Each cell shows:
//   - Day number (top-left)
//   - Price (override > base) when the cell is empty + has a price
//   - Booking bar across occupied days (start / middle / end / single)
//   - Small dot indicator if the day has a pricing override
//   - "Today" outline ring; past dates dimmed
//
// Click an empty/priced day → PriceEditModal. Click a booking → drawer.
//
// Source of truth: /api/property/[id]/calendar?start=...&end=...

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui";
import type { Booking, PricingOverride } from "@/lib/supabase";
import {
  DAYS_OF_WEEK,
  addMonths,
  buildMonthGrid,
  getBookingForDate,
  getOverrideForDate,
  startOfMonth,
  todayIso,
  type GridCell,
} from "@/lib/calendar-utils";
import { BookingDrawer } from "@/components/calendar/BookingDrawer";
import {
  PriceEditModal,
  type PriceEditScope,
} from "@/components/calendar/PriceEditModal";

type CalendarApiResponse = {
  property: { id: string; name: string; nickname: string | null };
  base_rate: number | null;
  bookings: Booking[];
  pricing_overrides: PricingOverride[];
  range: { start: string; end: string };
};

export function PropertyCalendarView({
  propertyId,
  propertyName,
}: {
  propertyId: string;
  propertyName: string;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [data, setData] = useState<CalendarApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [editScope, setEditScope] = useState<PriceEditScope | null>(null);
  const [syncing, setSyncing] = useState(false);

  const cells: GridCell[] = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const rangeStart = cells[0]?.iso;
  const rangeEnd = cells[cells.length - 1]?.iso;

  const fetchData = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/property/${propertyId}/calendar?start=${rangeStart}&end=${rangeEnd}`
      );
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `Calendar fetch failed (${r.status})`);
        setData(null);
      } else {
        setData(j as CalendarApiResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [propertyId, rangeStart, rangeEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const today = todayIso();
  const bookings = data?.bookings ?? [];
  const overrides = data?.pricing_overrides ?? [];
  const baseRate = data?.base_rate ?? null;
  const monthLabel = anchor.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  /* --------- Stats for the header --------- */

  const visibleInMonth = cells.filter((c) => c.inMonth);
  const occupiedDays = visibleInMonth.filter((c) => {
    const b = getBookingForDate(c.iso, bookings);
    return b && b.booking.status === "confirmed";
  }).length;
  const occupancyPct =
    visibleInMonth.length > 0
      ? Math.round((occupiedDays / visibleInMonth.length) * 100)
      : 0;
  const projectedRevenue = visibleInMonth.reduce((sum, c) => {
    const b = getBookingForDate(c.iso, bookings);
    if (b && b.booking.status === "confirmed") {
      // Spread the booking's host_payout across its occupied nights.
      if (b.booking.host_payout != null) {
        const nights = Math.max(
          1,
          Math.round(
            (new Date(b.booking.checkout_date).getTime() -
              new Date(b.booking.checkin_date).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        );
        return sum + b.booking.host_payout / nights;
      }
      // Else use override or base rate as a rough proxy.
      const o = getOverrideForDate(c.iso, overrides);
      if (o) return sum + o.price;
      if (baseRate) return sum + baseRate;
    }
    return sum;
  }, 0);

  /* --------- Cell click handlers --------- */

  const onCellClick = (iso: string) => {
    const b = getBookingForDate(iso, bookings);
    if (b) {
      setOpenBooking(b.booking);
      return;
    }
    const o = getOverrideForDate(iso, overrides);
    setEditScope({
      startDate: iso,
      endDate: iso,
      initialPrice: o?.price ?? baseRate ?? null,
      initialNote: o?.note ?? null,
      hasOverride: !!o,
    });
  };

  const onSavePrice = async (price: number, note: string) => {
    if (!editScope) return;
    const dates = enumerateDates(editScope.startDate, editScope.endDate);
    const r = await fetch(
      `/api/property/${propertyId}/pricing-override`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates, price, note }),
      }
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Save failed (${r.status})`);
    }
    setEditScope(null);
    await fetchData();
  };

  const onResetPrice = async () => {
    if (!editScope) return;
    const r = await fetch(
      `/api/property/${propertyId}/pricing-override?date=${editScope.startDate}`,
      { method: "DELETE" }
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Reset failed (${r.status})`);
    }
    setEditScope(null);
    await fetchData();
  };

  const onSyncFeeds = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/ical-sync?property_id=${propertyId}`, {
        method: "POST",
      });
      await fetchData();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="calendar_month" className="text-2xl text-brand" />
            <h1 className="text-xl font-extrabold">
              {monthLabel}{" "}
              <span className="text-sm font-medium text-txt-secondary ml-2">
                · {propertyName}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAnchor((a) => addMonths(a, -1))}
              className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
              title="Previous month"
            >
              <Icon
                name="chevron_left"
                className="text-lg text-txt-secondary"
              />
            </button>
            <button
              onClick={() => setAnchor(startOfMonth(new Date()))}
              className="px-3 py-1 rounded-full border border-surface-muted text-xs font-semibold text-txt-secondary hover:border-txt-secondary cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={() => setAnchor((a) => addMonths(a, 1))}
              className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
              title="Next month"
            >
              <Icon
                name="chevron_right"
                className="text-lg text-txt-secondary"
              />
            </button>
            <Button variant="ghost" size="sm" onClick={onSyncFeeds}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sync" className="text-sm" />
                {syncing ? "Syncing…" : "Sync feeds"}
              </span>
            </Button>
          </div>
        </div>

        {/* Month stats */}
        <div className="flex items-center gap-5 mt-3 text-xs text-txt-secondary">
          <span>
            <strong className="text-txt">{occupancyPct}%</strong> occupancy
          </span>
          <span>
            <strong className="text-txt">
              ${Math.round(projectedRevenue).toLocaleString()}
            </strong>{" "}
            projected revenue
          </span>
          {baseRate != null && (
            <span>
              base ${Math.round(baseRate)}/night
            </span>
          )}
          {error && (
            <span className="text-status-red">⚠ {error}</span>
          )}
        </div>
      </div>

      {/* Month grid */}
      <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-surface-muted">
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-bold uppercase tracking-wide text-txt-secondary py-2"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => (
            <DayCell
              key={c.iso}
              cell={c}
              today={today}
              baseRate={baseRate}
              bookings={bookings}
              overrides={overrides}
              onClick={() => onCellClick(c.iso)}
            />
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-xs text-txt-tertiary mt-2">Loading…</p>
      )}

      {/* Modals / drawers */}
      {openBooking && (
        <BookingDrawer
          booking={openBooking}
          propertyName={propertyName}
          onClose={() => setOpenBooking(null)}
        />
      )}
      {editScope && (
        <PriceEditModal
          scope={editScope}
          onClose={() => setEditScope(null)}
          onSave={onSavePrice}
          onReset={onResetPrice}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DayCell                                                            */
/* ------------------------------------------------------------------ */

function DayCell({
  cell,
  today,
  baseRate,
  bookings,
  overrides,
  onClick,
}: {
  cell: GridCell;
  today: string;
  baseRate: number | null;
  bookings: Booking[];
  overrides: PricingOverride[];
  onClick: () => void;
}) {
  const b = getBookingForDate(cell.iso, bookings);
  const o = getOverrideForDate(cell.iso, overrides);
  const isToday = cell.iso === today;
  const isPast = cell.iso < today;
  const day = parseInt(cell.iso.slice(8), 10);

  const isBlocked = b?.booking.status === "blocked";
  const isConfirmed = b?.booking.status === "confirmed";
  const position = b?.position;

  const price =
    o?.price ??
    (baseRate != null && !b ? baseRate : null);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "h-24 border-r border-b border-surface-muted text-left relative overflow-hidden cursor-pointer transition-colors",
        !cell.inMonth && "bg-surface-soft/40 opacity-50",
        cell.inMonth && !b && "hover:bg-surface-soft",
        isPast && cell.inMonth && !b && "opacity-65"
      )}
    >
      {/* Booking bar background */}
      {b && (
        <div
          className={clsx(
            "absolute inset-y-2 left-0 right-0 flex items-center px-2",
            isBlocked
              ? "bg-surface-muted/60"
              : "bg-brand/15 border-y border-brand/30",
            position === "start" && "rounded-l-lg ml-1",
            position === "end" && "rounded-r-lg mr-1",
            position === "single" && "rounded-lg mx-1"
          )}
          style={{
            // Diagonal stripes for blocked
            ...(isBlocked
              ? {
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 4px, transparent 4px 8px)",
                }
              : {}),
          }}
        >
          {(position === "start" || position === "single") && (
            <span
              className={clsx(
                "text-[11px] font-semibold truncate",
                isBlocked ? "text-txt-tertiary" : "text-brand"
              )}
            >
              {isBlocked
                ? "Blocked"
                : b.booking.guest_name ||
                  b.booking.summary ||
                  "Reserved"}
            </span>
          )}
        </div>
      )}

      {/* Day number */}
      <div className="relative px-2 py-1.5 flex items-start justify-between">
        <span
          className={clsx(
            "text-[11px] font-semibold",
            isToday
              ? "text-brand bg-white border border-brand rounded-full w-5 h-5 flex items-center justify-center"
              : isBlocked
              ? "text-txt-tertiary line-through"
              : cell.inMonth
              ? "text-txt"
              : "text-txt-tertiary"
          )}
        >
          {day}
        </span>
        {o && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5"
            title={`Override: $${o.price}`}
          />
        )}
      </div>

      {/* Price (only on free days) */}
      {!b && price != null && cell.inMonth && (
        <div className="absolute bottom-1.5 right-2 text-[11px] font-semibold text-txt-secondary">
          ${Math.round(price)}
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function enumerateDates(start: string, end: string): string[] {
  if (start > end) return [start];
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const last = new Date(end + "T12:00:00Z");
  while (d <= last) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
