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
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";

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
      // Cache-bust with a fresh timestamp on every fetch. Vercel CDN can
      // hold onto a pre-sync empty response for the same URL otherwise,
      // even when the route sends no-store headers. A unique URL per fetch
      // sidesteps that entirely.
      const r = await fetch(
        `/api/property/${propertyId}/calendar?start=${rangeStart}&end=${rangeEnd}&_t=${Date.now()}`,
        { cache: "no-store" }
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

  const [syncReport, setSyncReport] = useState<string | null>(null);

  const onSyncFeeds = async () => {
    setSyncing(true);
    setSyncReport(null);
    setError(null);
    // Blow away any locally-cached state before sync so the post-sync
    // refetch can't show a stale empty result.
    setData(null);
    try {
      const r = await fetch(`/api/ical-sync?property_id=${propertyId}`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Sync failed (${r.status})`);
      } else {
        const results = (j.results || []) as Array<{
          platform: string;
          fetched: number;
          upserted: number;
          errors: string[];
        }>;
        if (results.length === 0) {
          setError(
            "No feeds configured. Open Sync settings below to add one."
          );
        } else {
          const errs = results.flatMap((r) => r.errors);
          if (errs.length > 0) {
            setError(`Sync had errors: ${errs.join("; ")}`);
          } else {
            const totalUpserted = results.reduce(
              (s, r) => s + r.upserted,
              0
            );
            const totalFetched = results.reduce(
              (s, r) => s + r.fetched,
              0
            );
            setSyncReport(
              `Synced ${results.length} feed${
                results.length === 1 ? "" : "s"
              } — ${totalUpserted}/${totalFetched} bookings.`
            );
          }
        }
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // Count of pricing overrides that fall on visible in-month days.
  const overrideCount = visibleInMonth.filter(
    (c) => getOverrideForDate(c.iso, overrides) !== null
  ).length;

  return (
    <div className="max-w-6xl mx-auto flex gap-4 items-start">
      {/* Left column: month grid + light header strip */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-extrabold">
              {monthLabel}
              <span className="text-sm font-medium text-txt-secondary ml-2">
                · {propertyName}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-1">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onSyncFeeds}
              className="ml-1"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sync" className="text-sm" />
                {syncing ? "Syncing…" : "Sync"}
              </span>
            </Button>
          </div>
        </div>

        {(error || syncReport) && (
          <div className="mb-3 text-xs">
            {error && (
              <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-status-red font-semibold">
                ⚠ {error}
              </div>
            )}
            {syncReport && !error && (
              <div className="rounded-lg border border-status-green/30 bg-status-green-bg/50 px-3 py-2 text-status-green font-semibold">
                ✓ {syncReport}
              </div>
            )}
          </div>
        )}

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
      </div>

      {/* Right column: persistent settings sidebar */}
      <CalendarSidebar
        propertyId={propertyId}
        occupancyPct={occupancyPct}
        projectedRevenue={projectedRevenue}
        bookingsCount={bookings.length}
        baseRate={baseRate}
        overrideCount={overrideCount}
        onSyncDone={fetchData}
      />

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
        "h-16 border-r border-b border-surface-muted text-left relative overflow-hidden cursor-pointer transition-colors",
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
