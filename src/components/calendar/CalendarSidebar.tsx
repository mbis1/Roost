// src/components/calendar/CalendarSidebar.tsx
//
// Sprint E refinement — right-side persistent settings panel for the
// Calendar tab. Matches Airbnb's host-calendar layout: calendar on the
// left, sticky stack of settings cards on the right (sync, this-month
// stats, pricing).
//
// Sync section is always visible — no collapsing — so the user can paste
// a feed URL or hit "Sync now" without leaving the calendar view.

"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import { Button, Input, Select } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { IcalFeed } from "@/lib/supabase";

const PLATFORMS = ["airbnb", "vrbo", "booking", "direct"];

const HELP_TEXT: Record<string, string> = {
  airbnb:
    "Airbnb → Listing → Calendar → Availability → Sync calendars → Export",
  vrbo: "Vrbo → Property → Calendar → Sync your calendars → Export",
  booking: "Booking.com Extranet → Calendar → Sync calendars → Export",
  direct: "Any iCal feed URL you publish yourself",
};

export function CalendarSidebar({
  propertyId,
  occupancyPct,
  projectedRevenue,
  bookingsCount,
  baseRate,
  overrideCount,
  onSyncDone,
}: {
  propertyId: string;
  occupancyPct: number;
  projectedRevenue: number;
  bookingsCount: number;
  baseRate: number | null;
  overrideCount: number;
  onSyncDone: () => Promise<void> | void;
}) {
  return (
    <aside className="w-[280px] flex-shrink-0 space-y-3 sticky top-4 self-start">
      <SyncCard propertyId={propertyId} onSyncDone={onSyncDone} />
      <StatsCard
        occupancyPct={occupancyPct}
        projectedRevenue={projectedRevenue}
        bookingsCount={bookingsCount}
      />
      <PricingCard baseRate={baseRate} overrideCount={overrideCount} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Sync card                                                          */
/* ------------------------------------------------------------------ */

function SyncCard({
  propertyId,
  onSyncDone,
}: {
  propertyId: string;
  onSyncDone: () => Promise<void> | void;
}) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draftPlatform, setDraftPlatform] = useState("airbnb");
  const [draftUrl, setDraftUrl] = useState("");

  const loadFeeds = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("properties")
      .select("ical_feeds")
      .eq("id", propertyId)
      .maybeSingle();
    const next = ((data?.ical_feeds as IcalFeed[]) || []) as IcalFeed[];
    setFeeds(next);
    // Auto-show the add form if the user has no feeds yet.
    if (next.length === 0) setShowAddForm(true);
    setLoading(false);
  };

  useEffect(() => {
    loadFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const saveAndSync = async (platform: string, url: string) => {
    if (!url.trim()) {
      setError("Feed URL is required");
      return;
    }
    setBusyPlatform(platform);
    setError(null);
    setReport(null);
    try {
      const r = await fetch(`/api/property/${propertyId}/ical-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, url: url.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Save failed (${r.status})`);
      } else {
        const sr = j.sync_result;
        if (sr?.errors?.length) {
          setError(`Sync errors: ${sr.errors.join("; ")}`);
        } else if (sr) {
          setReport(`${sr.upserted}/${sr.fetched} bookings synced`);
        }
      }
      await loadFeeds();
      await onSyncDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPlatform(null);
    }
  };

  const removeFeed = async (platform: string) => {
    if (!confirm(`Remove ${platform} feed? Existing bookings stay.`)) return;
    setBusyPlatform(platform);
    setError(null);
    setReport(null);
    try {
      const r = await fetch(
        `/api/property/${propertyId}/ical-feed?platform=${encodeURIComponent(
          platform
        )}`,
        { method: "DELETE" }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `Remove failed (${r.status})`);
      }
      await loadFeeds();
      await onSyncDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPlatform(null);
    }
  };

  return (
    <SidebarCard
      icon="sync_alt"
      title="Calendar sync"
      subtitle={
        loading
          ? "Loading…"
          : feeds.length === 0
          ? "No feeds — add one below"
          : `${feeds.length} feed${feeds.length === 1 ? "" : "s"}`
      }
    >
      <div className="space-y-2">
        {feeds.map((f) => (
          <div
            key={f.platform + f.url}
            className="rounded-lg border border-surface-muted bg-surface-soft/40 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-brand">
                {f.platform}
              </span>
              <span
                className={clsx(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded",
                  f.last_synced_at
                    ? "bg-status-green-bg text-status-green"
                    : "bg-status-orange-bg text-status-orange"
                )}
              >
                {f.last_synced_at
                  ? `${relativeTime(f.last_synced_at)}`
                  : "not synced"}
              </span>
            </div>
            <div className="text-[10px] text-txt-tertiary truncate font-mono mt-1">
              {f.url}
            </div>
            <div className="flex gap-1 mt-2">
              <button
                type="button"
                disabled={busyPlatform === f.platform}
                onClick={() => saveAndSync(f.platform, f.url)}
                className="flex-1 text-[10px] font-semibold px-2 py-1 rounded border border-surface-muted bg-white hover:border-brand hover:text-brand cursor-pointer disabled:opacity-50"
              >
                {busyPlatform === f.platform ? "Syncing…" : "↻ Sync now"}
              </button>
              <button
                type="button"
                disabled={busyPlatform === f.platform}
                onClick={() => removeFeed(f.platform)}
                className="text-[10px] font-semibold px-2 py-1 rounded border border-surface-muted bg-white text-txt-tertiary hover:border-status-red hover:text-status-red cursor-pointer disabled:opacity-50"
                title="Remove feed"
              >
                <Icon name="delete" className="text-xs" />
              </button>
            </div>
          </div>
        ))}

        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full text-[11px] font-semibold px-2 py-1.5 rounded border border-dashed border-surface-muted text-txt-secondary hover:border-brand hover:text-brand cursor-pointer transition-colors"
          >
            + Add feed
          </button>
        )}

        {showAddForm && (
          <div className="rounded-lg border border-dashed border-surface-muted p-2 space-y-1.5">
            <Select
              value={draftPlatform}
              onChange={setDraftPlatform}
              options={PLATFORMS}
            />
            <Input
              value={draftUrl}
              onChange={setDraftUrl}
              placeholder="iCal feed URL"
            />
            <p className="text-[9px] text-txt-tertiary leading-snug">
              {HELP_TEXT[draftPlatform]}
            </p>
            <div className="flex gap-1 pt-1">
              <Button
                size="sm"
                onClick={async () => {
                  await saveAndSync(draftPlatform, draftUrl);
                  if (!error) {
                    setDraftUrl("");
                    if (feeds.length > 0) setShowAddForm(false);
                  }
                }}
              >
                {busyPlatform ? "…" : "Save & sync"}
              </Button>
              {feeds.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setDraftUrl("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-status-red/30 bg-status-red-bg/50 px-2 py-1 text-[10px] text-status-red font-semibold leading-snug">
            ⚠ {error}
          </div>
        )}
        {report && !error && (
          <div className="rounded border border-status-green/30 bg-status-green-bg/50 px-2 py-1 text-[10px] text-status-green font-semibold leading-snug">
            ✓ {report}
          </div>
        )}
      </div>
    </SidebarCard>
  );
}

/* ------------------------------------------------------------------ */
/* Stats card                                                         */
/* ------------------------------------------------------------------ */

function StatsCard({
  occupancyPct,
  projectedRevenue,
  bookingsCount,
}: {
  occupancyPct: number;
  projectedRevenue: number;
  bookingsCount: number;
}) {
  return (
    <SidebarCard icon="insights" title="This month">
      <div className="space-y-2">
        <StatRow
          label="Occupancy"
          value={`${occupancyPct}%`}
        />
        <StatRow
          label="Projected revenue"
          value={`$${Math.round(projectedRevenue).toLocaleString()}`}
        />
        <StatRow
          label="Bookings visible"
          value={`${bookingsCount}`}
        />
      </div>
    </SidebarCard>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-txt-secondary">{label}</span>
      <span className="text-sm font-bold text-txt">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing card                                                       */
/* ------------------------------------------------------------------ */

function PricingCard({
  baseRate,
  overrideCount,
}: {
  baseRate: number | null;
  overrideCount: number;
}) {
  return (
    <SidebarCard icon="payments" title="Pricing">
      <div className="space-y-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary">
            Base nightly rate
          </div>
          <div className="text-base font-extrabold text-txt mt-0.5">
            {baseRate != null ? `$${Math.round(baseRate)}` : "Not set"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-txt-tertiary">
            Manual overrides this month
          </div>
          <div className="text-base font-extrabold text-txt mt-0.5">
            {overrideCount}
          </div>
        </div>
        <p className="text-[10px] text-txt-tertiary leading-snug pt-1 border-t border-surface-muted">
          Set base rate in <strong>Operations → Pricing rules</strong>.
          Click any day in the grid to add a per-day override.
        </p>
      </div>
    </SidebarCard>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable card chrome                                               */
/* ------------------------------------------------------------------ */

function SidebarCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-muted">
        <Icon name={icon} className="text-base text-txt-secondary" />
        <span className="text-sm font-bold text-txt">{title}</span>
        {subtitle && (
          <span className="text-[10px] text-txt-tertiary ml-auto truncate">
            {subtitle}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}
