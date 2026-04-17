"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { useProperties } from "@/lib/hooks";
import { Icon } from "@/components/Icon";

/**
 * Cross-property calendar. Each row is a property; each column is a day.
 * Booking bars will render once booking_history (or iCal sync) populates it.
 * Empty state today — this is the shell the data slots into later.
 */
export function PortfolioCalendarTab() {
  const { data: properties, loading } = useProperties();
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));

  const month = anchor.getMonth();
  const year = anchor.getFullYear();
  const days = useMemo(() => {
    const d = new Date(year, month, 1);
    const out: Date[] = [];
    while (d.getMonth() === month) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [year, month]);

  const todayStr = new Date().toDateString();
  const monthLabel = anchor.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const prev = () => setAnchor((a) => addMonths(a, -1));
  const next = () => setAnchor((a) => addMonths(a, 1));
  const today = () => setAnchor(startOfMonth(new Date()));

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="calendar_today" className="text-2xl text-txt-secondary" />
          <h2 className="text-xl font-extrabold">Calendar</h2>
          <span className="text-xs text-txt-secondary ml-2">
            All properties
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
            title="Previous month"
          >
            <Icon name="chevron_left" className="text-lg text-txt-secondary" />
          </button>
          <button
            onClick={today}
            className="px-3 py-1 rounded-full border border-surface-muted text-xs font-semibold text-txt-secondary hover:border-txt-secondary cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={next}
            className="p-2 rounded-lg hover:bg-surface-soft cursor-pointer"
            title="Next month"
          >
            <Icon name="chevron_right" className="text-lg text-txt-secondary" />
          </button>
          <div className="ml-3 font-bold text-base min-w-[140px] text-right">
            {monthLabel}
          </div>
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
            Add a property to start seeing its bookings across the portfolio.
          </p>
        </div>
      )}

      {!loading && properties.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden">
          {/* Scroll container for the grid */}
          <div className="overflow-x-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `180px repeat(${days.length}, minmax(28px, 1fr))`,
              }}
            >
              {/* Top-left corner */}
              <div className="bg-surface-soft border-b border-r border-surface-muted py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-txt-secondary sticky left-0 z-10">
                Property
              </div>

              {/* Day headers */}
              {days.map((d) => {
                const isToday = d.toDateString() === todayStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={d.toISOString()}
                    className={clsx(
                      "border-b border-surface-muted text-[10px] font-semibold text-center py-2",
                      isToday && "bg-brand/10 text-brand",
                      !isToday && isWeekend && "bg-surface-soft/60",
                      !isToday && !isWeekend && "text-txt-secondary"
                    )}
                  >
                    <div>
                      {d.toLocaleString(undefined, { weekday: "narrow" })}
                    </div>
                    <div className={isToday ? "font-extrabold" : ""}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}

              {/* Property rows */}
              {properties.map((p, rowIdx) => (
                <PropertyRow
                  key={p.id}
                  property={p}
                  days={days}
                  todayStr={todayStr}
                  striped={rowIdx % 2 === 1}
                />
              ))}
            </div>
          </div>

          {/* Legend / empty hint */}
          <div className="px-4 py-3 border-t border-surface-muted flex items-center justify-between text-xs text-txt-secondary">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-brand/60 inline-block" />
                Booked
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-status-orange/60 inline-block" />
                Pending
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-surface-muted inline-block" />
                Available
              </span>
            </div>
            <span className="text-[11px] text-txt-tertiary">
              Booking bars will appear once iCal sync or manual bookings populate.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyRow({
  property,
  days,
  todayStr,
  striped,
}: {
  property: { id: string; name: string; nickname: string; primary_photo_url: string };
  days: Date[];
  todayStr: string;
  striped: boolean;
}) {
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
      </div>
      {days.map((d) => {
        const isToday = d.toDateString() === todayStr;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <div
            key={d.toISOString()}
            className={clsx(
              "border-b border-surface-muted/60 h-10 relative",
              isToday && "bg-brand/5",
              !isToday && isWeekend && "bg-surface-soft/30",
              striped && !isToday && !isWeekend && "bg-surface-soft/20"
            )}
          />
        );
      })}
    </>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
