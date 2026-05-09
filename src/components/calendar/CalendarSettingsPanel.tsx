// src/components/calendar/CalendarSettingsPanel.tsx
//
// Sprint E refinement — inline settings dashboard for the Calendar tab.
// Manages a property's iCal feeds without sending the user back to the
// Business tab. Feeds are stored on properties.ical_feeds (jsonb); the
// /api/property/[id]/ical-feed POST endpoint upserts AND syncs in one
// shot.
//
// Auto-expands when there are zero feeds so the "paste URL" form is
// immediately visible. Collapses when feeds exist and sync ran clean.

"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/Icon";
import { Button, Input, Select, Label, FormField } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { IcalFeed } from "@/lib/supabase";

const PLATFORMS = ["airbnb", "vrbo", "booking", "direct"];

const HELP_TEXT: Record<string, string> = {
  airbnb:
    "Listing → Calendar → Availability → Sync calendars → Export calendar",
  vrbo: "Property settings → Calendar → Sync your calendars → Export calendar",
  booking: "Extranet → Calendar → Sync calendars → Export",
  direct: "Paste any iCal feed URL you publish yourself",
};

export function CalendarSettingsPanel({
  propertyId,
  onSyncDone,
}: {
  propertyId: string;
  /** Called after any save / sync / remove so the calendar refetches. */
  onSyncDone: () => Promise<void> | void;
}) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncReport, setLastSyncReport] = useState<string | null>(null);

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
    // Auto-expand when no feeds yet — user needs to add one to do anything.
    setExpanded((prev) => prev || next.length === 0);
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
    setLastSyncReport(null);
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
        if (sr) {
          if (sr.errors?.length) {
            setError(`Saved but sync had errors: ${sr.errors.join("; ")}`);
          } else {
            setLastSyncReport(
              `${platform} synced — ${sr.upserted}/${sr.fetched} bookings upserted${
                sr.skipped ? ` (${sr.skipped} skipped)` : ""
              }.`
            );
          }
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

  const headerLabel = loading
    ? "Loading sync settings…"
    : feeds.length === 0
    ? "No feeds connected — paste an iCal URL to get bookings"
    : `${feeds.length} feed${feeds.length === 1 ? "" : "s"} connected${
        feeds[0]?.last_synced_at
          ? ` · ${feeds[0].platform} synced ${relativeTime(
              feeds[0].last_synced_at
            )}`
          : ""
      }`;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-soft/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="settings" className="text-base text-txt-secondary" />
          <span className="text-sm font-bold text-txt">Sync settings</span>
          <span className="text-xs text-txt-tertiary truncate">
            · {headerLabel}
          </span>
        </div>
        <Icon
          name={expanded ? "expand_less" : "expand_more"}
          className="text-base text-txt-secondary flex-shrink-0"
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-surface-muted">
          {/* Existing feeds */}
          {feeds.map((f) => (
            <FeedRow
              key={f.platform + f.url}
              feed={f}
              busy={busyPlatform === f.platform}
              onSync={() => saveAndSync(f.platform, f.url)}
              onRemove={() => removeFeed(f.platform)}
            />
          ))}

          {/* Add-feed form */}
          <div className="border border-dashed border-surface-muted rounded-xl p-3 bg-surface-soft/30 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-txt-secondary">
              Add feed
            </p>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Platform">
                <Select
                  value={draftPlatform}
                  onChange={setDraftPlatform}
                  options={PLATFORMS}
                />
              </FormField>
              <div className="col-span-2">
                <Label>iCal feed URL</Label>
                <Input
                  value={draftUrl}
                  onChange={setDraftUrl}
                  placeholder="https://www.airbnb.com/calendar/ical/…"
                />
              </div>
            </div>
            <p className="text-[10px] text-txt-tertiary leading-relaxed">
              {HELP_TEXT[draftPlatform] || "Paste an iCal URL"}
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  await saveAndSync(draftPlatform, draftUrl);
                  setDraftUrl("");
                }}
              >
                {busyPlatform ? "Working…" : "Save & sync"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold">
              {error}
            </div>
          )}
          {lastSyncReport && !error && (
            <div className="rounded-lg border border-status-green/30 bg-status-green-bg/50 px-3 py-2 text-xs text-status-green font-semibold">
              ✓ {lastSyncReport}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FeedRow({
  feed,
  busy,
  onSync,
  onRemove,
}: {
  feed: IcalFeed;
  busy: boolean;
  onSync: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-3 flex items-center gap-3">
      <div className="flex-shrink-0 w-12 h-12 rounded bg-brand/10 flex items-center justify-center">
        <Icon name="public" className="text-base text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand">
            {feed.platform}
          </span>
          <span
            className={clsx(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              feed.last_synced_at
                ? "bg-status-green-bg text-status-green"
                : "bg-status-orange-bg text-status-orange"
            )}
          >
            {feed.last_synced_at
              ? `synced ${relativeTime(feed.last_synced_at)}`
              : "not synced yet"}
          </span>
        </div>
        <div className="text-xs text-txt-secondary truncate mt-0.5 font-mono">
          {feed.url}
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onSync}>
          {busy ? "…" : "Sync now"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Icon name="delete" className="text-sm" />
        </Button>
      </div>
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
