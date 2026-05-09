// src/components/property/cards/ListingsAndCalendarSyncCard.tsx
//
// Sprint E — Business-tab card for managing iCal feeds per platform on a
// property. Reads/writes properties.ical_feeds (jsonb) directly via the
// /api/property/[id]/ical-feed endpoints. Triggers an immediate sync on
// save.

"use client";

import { useEffect, useState } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, Select, Button, Label, FormField } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatDistanceToNow } from "date-fns";
import type { IcalFeed } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

const PLATFORMS = ["airbnb", "vrbo", "booking", "direct"];

const HELP_TEXT: Record<string, string> = {
  airbnb:
    "Listing → Calendar → Availability → Sync calendars → Export calendar",
  vrbo: "Property settings → Calendar → Sync your calendars → Export calendar",
  booking: "Extranet → Calendar → Sync calendars → Export",
  direct: "Paste any iCal feed URL you publish yourself",
};

export function ListingsAndCalendarSyncCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFeeds = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("properties")
      .select("ical_feeds")
      .eq("id", propertyId)
      .maybeSingle();
    setFeeds(((data?.ical_feeds as IcalFeed[]) || []) as IcalFeed[]);
    setLoading(false);
  };

  useEffect(() => {
    loadFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const filled = feeds.filter((f) => f.url?.trim()).length;
  const status = cardStatus(filled, Math.max(1, feeds.length));

  const summaryParts: string[] = [];
  for (const f of feeds) {
    if (!f.url?.trim()) continue;
    if (f.last_synced_at) {
      try {
        summaryParts.push(
          `${f.platform} synced ${formatDistanceToNow(
            new Date(f.last_synced_at),
            { addSuffix: true }
          )}`
        );
      } catch {
        summaryParts.push(`${f.platform} configured`);
      }
    } else {
      summaryParts.push(`${f.platform} configured`);
    }
  }
  const summary = summaryParts.join(" · ") || undefined;

  return (
    <PropertyCard
      icon="sync_alt"
      title="Listings & Calendar Sync"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <Editor
          propertyId={propertyId}
          feeds={feeds}
          loading={loading}
          busy={busy}
          error={error}
          setBusy={setBusy}
          setError={setError}
          reload={loadFeeds}
          close={close}
        />
      )}
    </PropertyCard>
  );
}

/* ------------------------------------------------------------------ */

function Editor({
  propertyId,
  feeds,
  loading,
  busy,
  error,
  setBusy,
  setError,
  reload,
  close,
}: {
  propertyId: string;
  feeds: IcalFeed[];
  loading: boolean;
  busy: string | null;
  error: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  reload: () => Promise<void>;
  close: () => void;
}) {
  const [draftPlatform, setDraftPlatform] = useState<string>("airbnb");
  const [draftUrl, setDraftUrl] = useState<string>("");

  const saveFeed = async (platform: string, url: string) => {
    if (!url.trim()) {
      setError("Feed URL is required");
      return;
    }
    setBusy(platform);
    setError(null);
    try {
      const r = await fetch(`/api/property/${propertyId}/ical-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, url: url.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Save failed (${r.status})`);
      } else if (j.sync_result?.errors?.length) {
        setError(
          `Saved, but sync had errors: ${j.sync_result.errors.join("; ")}`
        );
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeFeed = async (platform: string) => {
    if (!confirm(`Remove ${platform} feed?`)) return;
    setBusy(platform);
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const syncFeed = async (platform: string, url: string) => {
    setBusy(platform);
    setError(null);
    try {
      // Re-saving is the simplest way to trigger an immediate sync on
      // an existing feed (the POST endpoint syncs after upsert).
      await saveFeed(platform, url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-secondary">
        One row per platform. Pasting a feed URL saves AND syncs immediately
        — bookings populate the Calendar tab and the portfolio timeline.
      </p>

      {loading && (
        <p className="text-sm text-txt-tertiary italic">Loading feeds…</p>
      )}

      {!loading && feeds.length === 0 && (
        <p className="text-sm text-txt-tertiary italic">
          No feeds yet. Add one below.
        </p>
      )}

      {feeds.map((f) => (
        <div
          key={f.platform + f.url}
          className="border border-surface-muted rounded-xl p-3 space-y-2 bg-surface-soft/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-txt-secondary">
              {f.platform}
            </span>
            <button
              onClick={() => removeFeed(f.platform)}
              disabled={busy === f.platform}
              className="text-txt-tertiary hover:text-status-red cursor-pointer disabled:opacity-50"
              title="Remove this feed"
            >
              <Icon name="delete" className="text-lg" />
            </button>
          </div>
          <div className="text-xs text-txt-secondary truncate">
            {f.url}
          </div>
          <div className="flex items-center justify-between text-[11px] text-txt-tertiary">
            <span>
              {f.last_synced_at
                ? `Last synced ${formatDistanceToNow(
                    new Date(f.last_synced_at),
                    { addSuffix: true }
                  )}`
                : "Not synced yet"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncFeed(f.platform, f.url)}
            >
              {busy === f.platform ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>
      ))}

      {/* Add new feed */}
      <div className="border border-dashed border-surface-muted rounded-xl p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-txt-secondary">
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
              await saveFeed(draftPlatform, draftUrl);
              setDraftUrl("");
            }}
          >
            {busy ? "Working…" : "Save & sync"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-status-red font-semibold">
          {error}
        </p>
      )}

      <div className="flex justify-end pt-2 border-t border-surface-muted">
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
    </div>
  );
}
