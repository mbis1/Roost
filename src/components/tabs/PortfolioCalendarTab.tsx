// src/components/tabs/PortfolioCalendarTab.tsx
//
// Sprint E — multi-property horizontal timeline. Left rail of properties,
// horizontal scrolling day grid on the right. Bookings render as
// connected bars across their occupied days.
//
// Data: /api/property/[id]/calendar per property in parallel, scoped to
// the visible day range. Defaults to a 21-day window starting today.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useProperties } from "@/lib/hooks";
import { Icon } from "@/components/Icon";
import type { Booking } from "@/lib/supabase";
import {
  addDaysIso,
  isoFromDate,
  todayIso,
} from "@/lib/calendar-utils";
import { BookingDrawer } from "@/components/calendar/BookingDrawer";

type PropertyTimeline = {
  property_id: string;
  bookings: Booking[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_RANGE_DAYS = 21;
const DAY_COLUMN_WIDTH = 36; // px per day

export function PortfolioCalendarTab() {
  const { data: properties, loading } = useProperties();
  const [windowStart, setWindowStart] = useState<string>(() => todayIso());
  const [rangeDays] = useState<number>(DEFAULT_RANGE_DAYS);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < rangeDays; i++) out.push(addDaysIso(windowStart, i));
    return out;
  }, [windowStart, rangeDays]);

  const windowEnd = days[days.length - 1] || windowStart;

  const [timelines, setTimelines] = useState<
    Record<string, PropertyTimeline>
  >({});
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [openBookingPropertyName, setOpenBookingPropertyName] =
    useState<string | undefined>();

  const fetchTimelines = useCallback(async () => {
    if (!properties.length) return;
    const initial: Record<string, PropertyTimeline> = {};
    for (const p of properties) {
      initial[p.id] = {
        property_id: p.id,
        bookings: [],
        loading: true,
        error: null,
      };
    }
    setTimelines(initial);

    await Promise.all(
      properties.map(async (p) => {
        try {
          const r = await fetch(
            `/api/property/${p.id}/calendar?start=${windowStart}&end=${windowEnd}`
          );
          const j = await r.json();
          if (!r.ok) {
            setTimelines((prev) => ({
              ...prev,
              [p.id]: {
                ...prev[p.id],
                loading: false,
                error: j.error || `${r.status}`,
              },
            }));
            return;
          }
          setTimelines((prev) => ({
            ...prev,
            [p.id]: {
              property_id: p.id,
              bookings: (j.bookings || []) as Booking[],
              loading: false,
              error: null,
            },
          }));
        } catch (e) {
          setTimelines((prev) => ({
            ...prev,
            [p.id]: {
              ...prev[p.id],
              loading: false,
              error: e instanceof Error ? e.message : String(e),
            },
          }));
        }
      })
    );
  }, [properties, windowStart, windowEnd]);

  useEffect(() => {
    fetchTimelines();
  }, [fetchTimelines]);

  const today = todayIso();

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="calendar_today" className="text-2xl text-txt-secondary" />
          <h2 className="text-xl font-extrabold">Calendar</h2>
          <span className="text-xs text-txt-secondary ml-2">
            All properties · next {rangeDays} days
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setWindowStart((s) => addDaysIso(s, -7))
            }
            className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
            title="Back one week"
          >
            <Icon
              name="chevron_left"
              className="text-lg text-txt-secondary"
            />
          </button>
          <button
            onClick={() => setWindowStart(todayIso())}
            className="px-3 py-1 rounded-full border border-surface-muted text-xs font-semibold text-txt-secondary hover:border-txt-secondary cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={() => setWindowStart((s) => addDaysIso(s, 7))}
            className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
            title="Forward one week"
          >
            <Icon
              name="chevron_right"
              className="text-lg text-txt-secondary"
            />
          </button>
        </div>
      </div>

      {loading && <p className="text-txt-secondary text-sm">Loading…</p>}

      {!loading && properties.length === 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-dashed border-surface-muted rounded-2xl p-10 text-center">
          <Icon
            name="event_available"
            className="text-4xl text-txt-tertiary"
          />
          <p className="text-sm text-txt-secondary mt-2">
            Add a property to start seeing its bookings across the
            portfolio.
          </p>
        </div>
      )}

      {!loading && properties.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `200px repeat(${days.length}, minmax(${DAY_COLUMN_WIDTH}px, 1fr))`,
              }}
            >
              {/* Top-left corner */}
              <div className="bg-surface-soft border-b border-r border-surface-muted py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-txt-secondary sticky left-0 z-20">
                Property
              </div>

              {/* Day headers */}
              {days.map((iso) => {
                const d = new Date(iso + "T12:00:00Z");
                const isToday = iso === today;
                const weekday = d.getUTCDay();
                const isWeekend = weekday === 0 || weekday === 6;
                return (
                  <div
                    key={iso}
                    className={clsx(
                      "border-b border-surface-muted text-[10px] font-semibold text-center py-2",
                      isToday && "bg-brand/10 text-brand",
                      !isToday && isWeekend && "bg-surface-soft/60",
                      !isToday && !isWeekend && "text-txt-secondary"
                    )}
                  >
                    <div>
                      {d.toLocaleString(undefined, {
                        weekday: "narrow",
                        timeZone: "UTC",
                      })}
                    </div>
                    <div className={isToday ? "font-extrabold" : ""}>
                      {d.getUTCDate()}
                    </div>
                  </div>
                );
              })}

              {/* Property rows */}
              {properties.map((p, rowIdx) => {
                const timeline = timelines[p.id];
                return (
                  <PropertyTimelineRow
                    key={p.id}
                    property={p}
                    days={days}
                    today={today}
                    striped={rowIdx % 2 === 1}
                    bookings={timeline?.bookings || []}
                    rowLoading={timeline?.loading ?? false}
                    onBookingClick={(b) => {
                      setOpenBooking(b);
                      setOpenBookingPropertyName(p.nickname || p.name);
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="px-4 py-3 border-t border-surface-muted flex items-center justify-between text-xs text-txt-secondary">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-brand/30 inline-block border border-brand/50" />
                Reserved
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded inline-block border border-surface-muted"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(0,0,0,0.1) 0 3px, transparent 3px 6px)",
                  }}
                />
                Blocked
              </span>
            </div>
            <span className="text-[11px] text-txt-tertiary">
              Click any bar to see booking details. Use Sync feeds in a
              property&apos;s Calendar tab to refresh.
            </span>
          </div>
        </div>
      )}

      {openBooking && (
        <BookingDrawer
          booking={openBooking}
          propertyName={openBookingPropertyName}
          onClose={() => setOpenBooking(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PropertyTimelineRow                                                */
/* ------------------------------------------------------------------ */

function PropertyTimelineRow({
  property,
  days,
  today,
  striped,
  bookings,
  rowLoading,
  onBookingClick,
}: {
  property: {
    id: string;
    name: string;
    nickname: string;
    primary_photo_url: string;
  };
  days: string[];
  today: string;
  striped: boolean;
  bookings: Booking[];
  rowLoading: boolean;
  onBookingClick: (b: Booking) => void;
}) {
  // Figure out booking spans that overlap the visible window so we can
  // render a single continuous bar instead of 10 separate cell paints.
  const spans = useMemo(() => {
    const windowStart = days[0];
    const windowEnd = days[days.length - 1];
    if (!windowStart || !windowEnd) return [];

    type Span = {
      booking: Booking;
      startIdx: number; // 0-indexed column inside `days`
      endIdx: number; // inclusive
    };
    const out: Span[] = [];
    for (const b of bookings) {
      const lastOccupied = addDaysIso(b.checkout_date, -1);
      // Skip if entirely outside the window.
      if (lastOccupied < windowStart) continue;
      if (b.checkin_date > windowEnd) continue;
      const startIdx = Math.max(
        0,
        days.indexOf(b.checkin_date)
      );
      const startIdxClamped =
        startIdx < 0
          ? days.findIndex((d) => d >= b.checkin_date)
          : startIdx;
      const endIdxRaw = days.indexOf(lastOccupied);
      const endIdx =
        endIdxRaw < 0
          ? (() => {
              for (let i = days.length - 1; i >= 0; i--) {
                if (days[i] <= lastOccupied) return i;
              }
              return -1;
            })()
          : endIdxRaw;
      const safeStart =
        startIdxClamped < 0
          ? days.findIndex((d) => d >= b.checkin_date)
          : startIdxClamped;
      if (safeStart < 0 || endIdx < 0) continue;
      out.push({
        booking: b,
        startIdx: Math.max(0, safeStart),
        endIdx,
      });
    }
    return out;
  }, [bookings, days]);

  return (
    <>
      <div
        className={clsx(
          "border-b border-r border-surface-muted py-2 px-3 sticky left-0 z-10 flex items-center gap-2 min-w-0",
          striped ? "bg-surface-soft/40" : "bg-white"
        )}
      >
        <div className="w-6 h-6 rounded bg-gradient-to-br from-brand to-brand-dark text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {(property.nickname || property.name).charAt(0).toUpperCase()}
        </div>
        <span className="text-xs font-semibold truncate">
          {property.nickname || property.name}
        </span>
        {rowLoading && (
          <Icon
            name="more_horiz"
            className="text-xs text-txt-tertiary ml-auto"
          />
        )}
      </div>

      {/* Day cells (background grid). The bookings render absolutely
          positioned over the row container so they span multiple columns
          continuously. To allow that, every cell is positioned relative
          to a row-spanning overlay. */}
      <div
        className="col-span-full relative"
        style={{
          gridColumn: `2 / span ${days.length}`,
          display: "grid",
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((iso) => {
          const isToday = iso === today;
          const d = new Date(iso + "T12:00:00Z");
          const isWeekend =
            d.getUTCDay() === 0 || d.getUTCDay() === 6;
          return (
            <div
              key={iso}
              className={clsx(
                "border-b border-surface-muted/60 h-10 relative",
                isToday && "bg-brand/5",
                !isToday && isWeekend && "bg-surface-soft/30",
                striped && !isToday && !isWeekend && "bg-surface-soft/20"
              )}
            />
          );
        })}

        {/* Booking bars overlaid */}
        {spans.map((span, i) => {
          const isBlocked = span.booking.status === "blocked";
          const widthPct =
            ((span.endIdx - span.startIdx + 1) / days.length) * 100;
          const leftPct = (span.startIdx / days.length) * 100;
          return (
            <button
              key={`${span.booking.id}-${i}`}
              type="button"
              onClick={() => onBookingClick(span.booking)}
              className={clsx(
                "absolute top-1.5 bottom-1.5 rounded-md border text-[11px] font-semibold truncate px-2 text-left cursor-pointer transition-shadow",
                isBlocked
                  ? "border-surface-muted text-txt-tertiary"
                  : "border-brand/40 text-brand hover:shadow"
              )}
              style={{
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
                ...(isBlocked
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 4px, transparent 4px 8px)",
                      backgroundColor: "rgba(0,0,0,0.02)",
                    }
                  : { backgroundColor: "rgba(186, 0, 54, 0.12)" }),
              }}
              title={
                isBlocked
                  ? "Blocked"
                  : span.booking.guest_name ||
                    span.booking.summary ||
                    "Reserved"
              }
            >
              {isBlocked
                ? "Blocked"
                : span.booking.guest_name ||
                  span.booking.summary ||
                  "Reserved"}
            </button>
          );
        })}
      </div>
    </>
  );
}
