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
  addDaysIso,
  addMonths,
  buildMonthGrid,
  getBookingForDate,
  getOverrideForDate,
  getScheduledForDate,
  startOfMonth,
  todayIso,
  type GridCell,
  type ScheduledItem,
} from "@/lib/calendar-utils";
import { ScheduledItemDrawer } from "@/components/calendar/ScheduledItemDrawer";
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
  scheduled_items: ScheduledItem[];
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
  const [openItem, setOpenItem] = useState<ScheduledItem | null>(null);
  const [editScope, setEditScope] = useState<PriceEditScope | null>(null);
  const [syncing, setSyncing] = useState(false);

  const cells: GridCell[] = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const rangeStart = cells[0]?.iso;
  const rangeEnd = cells[cells.length - 1]?.iso;

  // Chunk the 42-cell grid into 6 week rows for week-level overlays.
  const weeks: GridCell[][] = useMemo(() => {
    const out: GridCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

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
  const scheduledItems = data?.scheduled_items ?? [];
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
          {weeks.map((weekCells, weekIdx) => (
            <WeekRow
              key={weekIdx}
              cells={weekCells}
              today={today}
              baseRate={baseRate}
              bookings={bookings}
              overrides={overrides}
              scheduledItems={scheduledItems}
              onCellClick={onCellClick}
              onBookingClick={setOpenBooking}
              onItemClick={setOpenItem}
            />
          ))}
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
          onUpdated={fetchData}
        />
      )}
      {openItem && (
        <ScheduledItemDrawer
          item={openItem}
          booking={
            openItem.booking_id
              ? bookings.find((b) => b.id === openItem.booking_id) || null
              : null
          }
          onClose={() => setOpenItem(null)}
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
/* WeekRow — 7 day cells + an overlay of continuous booking bars      */
/* ------------------------------------------------------------------ */

type BookingSegment = {
  booking: Booking;
  startCol: number; // 0-6 inclusive within this week
  endCol: number; // 0-6 inclusive
  /** Bar's left edge is the booking's true start (round it). */
  roundLeft: boolean;
  /** Bar's right edge is the booking's true end (round it). */
  roundRight: boolean;
};

function computeBookingSegments(
  weekCells: GridCell[],
  bookings: Booking[]
): BookingSegment[] {
  if (weekCells.length === 0) return [];
  const weekStart = weekCells[0].iso;
  const weekEnd = weekCells[weekCells.length - 1].iso;

  const out: BookingSegment[] = [];
  for (const b of bookings) {
    // iCal checkout_date is exclusive — occupied range ends day before.
    const lastOccupied = addDaysIso(b.checkout_date, -1);
    if (lastOccupied < weekStart) continue;
    if (b.checkin_date > weekEnd) continue;

    // First column whose iso is >= booking.checkin_date.
    let startCol = 0;
    for (let i = 0; i < weekCells.length; i++) {
      if (weekCells[i].iso >= b.checkin_date) {
        startCol = i;
        break;
      }
    }
    // Last column whose iso is <= lastOccupied.
    let endCol = 6;
    for (let i = weekCells.length - 1; i >= 0; i--) {
      if (weekCells[i].iso <= lastOccupied) {
        endCol = i;
        break;
      }
    }
    if (startCol > endCol) continue;

    out.push({
      booking: b,
      startCol,
      endCol,
      roundLeft: b.checkin_date >= weekStart,
      roundRight: lastOccupied <= weekEnd,
    });
  }
  return out;
}

function WeekRow({
  cells,
  today,
  baseRate,
  bookings,
  overrides,
  scheduledItems,
  onCellClick,
  onBookingClick,
  onItemClick,
}: {
  cells: GridCell[];
  today: string;
  baseRate: number | null;
  bookings: Booking[];
  overrides: PricingOverride[];
  scheduledItems: ScheduledItem[];
  onCellClick: (iso: string) => void;
  onBookingClick: (b: Booking) => void;
  onItemClick: (item: ScheduledItem) => void;
}) {
  const segments = useMemo(
    () => computeBookingSegments(cells, bookings),
    [cells, bookings]
  );

  return (
    <div className="relative grid grid-cols-7">
      {cells.map((c) => {
        // Does any booking occupy this date? Used to suppress the price.
        const hasBooking = bookings.some((b) => {
          const lastOccupied = addDaysIso(b.checkout_date, -1);
          return c.iso >= b.checkin_date && c.iso <= lastOccupied;
        });
        return (
          <DayCell
            key={c.iso}
            cell={c}
            today={today}
            baseRate={baseRate}
            overrides={overrides}
            scheduledItems={scheduledItems}
            hasBooking={hasBooking}
            onClick={() => onCellClick(c.iso)}
            onItemClick={onItemClick}
          />
        );
      })}

      {/* Continuous booking bars overlay (per-week) */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ top: 22, height: 14 }}
        aria-hidden
      >
        {segments.map((seg) => (
          <BookingBar
            key={seg.booking.id}
            segment={seg}
            onClick={() => onBookingClick(seg.booking)}
          />
        ))}
      </div>
    </div>
  );
}

function BookingBar({
  segment,
  onClick,
}: {
  segment: BookingSegment;
  onClick: () => void;
}) {
  const { booking, startCol, endCol, roundLeft, roundRight } = segment;
  const isBlocked = booking.status === "blocked";
  const label = booking.guest_name || booking.summary || "Reserved";
  const widthPct = ((endCol - startCol + 1) / 7) * 100;
  const leftPct = (startCol / 7) * 100;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "absolute h-3.5 px-2 flex items-center text-[10px] font-semibold truncate cursor-pointer pointer-events-auto border transition-colors",
        roundLeft && "rounded-l-md",
        roundRight && "rounded-r-md",
        isBlocked
          ? "bg-surface-muted/60 text-txt-tertiary border-surface-muted"
          : "bg-brand/15 text-brand border-brand/40 hover:bg-brand/25 hover:border-brand/60"
      )}
      style={{
        left: `calc(${leftPct}% + ${roundLeft ? 2 : 0}px)`,
        width: `calc(${widthPct}% - ${
          (roundLeft ? 2 : 0) + (roundRight ? 2 : 0)
        }px)`,
        ...(isBlocked
          ? {
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 4px, transparent 4px 8px)",
            }
          : {}),
      }}
      title={isBlocked ? "Blocked" : label}
    >
      <span className="truncate">{isBlocked ? "Blocked" : label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* DayCell                                                            */
/* ------------------------------------------------------------------ */

function DayCell({
  cell,
  today,
  baseRate,
  overrides,
  scheduledItems,
  hasBooking,
  onClick,
  onItemClick,
}: {
  cell: GridCell;
  today: string;
  baseRate: number | null;
  overrides: PricingOverride[];
  scheduledItems: ScheduledItem[];
  hasBooking: boolean;
  onClick: () => void;
  onItemClick: (item: ScheduledItem) => void;
}) {
  const o = getOverrideForDate(cell.iso, overrides);
  const dayItems = getScheduledForDate(cell.iso, scheduledItems);

  const isToday = cell.iso === today;
  const isPast = cell.iso < today;
  const day = parseInt(cell.iso.slice(8), 10);

  const price = o?.price ?? (baseRate != null && !hasBooking ? baseRate : null);

  return (
    <div
      onClick={onClick}
      className={clsx(
        "h-16 border-r border-b border-surface-muted text-left relative overflow-hidden cursor-pointer transition-colors",
        !cell.inMonth && "bg-surface-soft/40 opacity-50",
        cell.inMonth && !hasBooking && "hover:bg-surface-soft/60",
        isPast && cell.inMonth && !hasBooking && "opacity-70"
      )}
    >
      {/* Top row: day number + price / override dot */}
      <div className="px-1.5 pt-1 flex items-start justify-between gap-1">
        <span
          className={clsx(
            "text-[11px] font-semibold leading-none",
            isToday
              ? "text-brand bg-white border border-brand rounded-full w-4 h-4 flex items-center justify-center"
              : cell.inMonth
              ? "text-txt"
              : "text-txt-tertiary"
          )}
        >
          {day}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {o && (
            <span
              className="w-1 h-1 rounded-full bg-brand"
              title={`Override: $${o.price}`}
            />
          )}
          {!hasBooking && price != null && cell.inMonth && (
            <span className="text-[9px] font-semibold text-txt-secondary leading-none">
              ${Math.round(price)}
            </span>
          )}
        </div>
      </div>

      {/* Reserve 18px vertical room for the per-week booking overlay
          (rendered at WeekRow level, top: 22, h: 14). Chips stack below. */}
      <div
        className="absolute left-0 right-0 px-1 flex flex-col gap-0.5"
        style={{ top: 40 }}
      >
        {dayItems.slice(0, 3).map((item, i) => (
          <ItemChip
            key={`${cell.iso}-${i}`}
            item={item}
            onClick={(e) => {
              e.stopPropagation();
              onItemClick(item);
            }}
          />
        ))}
        {dayItems.length > 3 && (
          <span className="text-[8px] text-txt-tertiary font-semibold leading-none px-1">
            +{dayItems.length - 3}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ItemChip — small clickable category pill                           */
/* ------------------------------------------------------------------ */

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

function itemShortLabel(item: ScheduledItem): string {
  switch (item.category) {
    case "message":
      return "Message";
    case "ping":
      return "Ping";
    case "lock":
      return "Lock";
    case "cleaner":
      return "Cleaner";
    case "checkin":
      return "Check-in";
    case "checkout":
      return "Check-out";
    case "turnover":
      return "Turnover";
    default:
      return item.type === "event" ? "Event" : "Task";
  }
}

function ItemChip({
  item,
  onClick,
}: {
  item: ScheduledItem;
  onClick: (e: React.MouseEvent) => void;
}) {
  const icon = itemIcon(item);
  const short = itemShortLabel(item);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={clsx(
        "h-3 px-1 flex items-center gap-0.5 rounded-sm cursor-pointer transition-colors leading-none truncate text-[9px] font-semibold",
        item.type === "task"
          ? "bg-status-orange-bg/80 text-status-orange hover:bg-status-orange-bg border border-status-orange/30"
          : "bg-status-blue-bg/80 text-status-blue hover:bg-status-blue-bg border border-status-blue/30"
      )}
      title={item.label}
    >
      <span aria-hidden>{icon}</span>
      <span className="truncate">{short}</span>
    </div>
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
