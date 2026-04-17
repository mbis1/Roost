"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, Select, Button, Label } from "@/components/ui";
import { Icon } from "@/components/Icon";

const PLATFORMS = ["Airbnb", "VRBO", "Booking.com", "Direct", "Other"];

export type ListingRow = {
  platform: string;
  url: string;
  listing_id: string;
  contact_email: string; // the anjeyka@yahoo.com alias that gets inquiries for this listing
  ical_url: string;
};

type ListingsData = { rows?: ListingRow[] };

function emptyRow(): ListingRow {
  return { platform: "Airbnb", url: "", listing_id: "", contact_email: "", ical_url: "" };
}

export function ListingsCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const initial = (data as ListingsData)?.rows || [];
  const [rows, setRows] = useState<ListingRow[]>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows((data as ListingsData)?.rows || []);
  }, [data]);

  const filled = rows.filter((r) => r.url.trim() || r.listing_id.trim()).length;
  const status = cardStatus(filled, Math.max(1, rows.length));

  const summary =
    rows.length > 0
      ? rows
          .filter((r) => r.url || r.listing_id)
          .map((r) => r.platform)
          .join(", ") || undefined
      : undefined;

  const update = (i: number, field: keyof ListingRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  return (
    <PropertyCard
      icon="public"
      title="Listings"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <div className="space-y-4">
          <p className="text-xs text-txt-secondary">
            One row per platform you list on. The <b>contact email</b> is the
            alias (typically on anjeyka@yahoo.com) that gets inquiries for this
            listing — used later to auto-match incoming emails to this property.
          </p>

          {rows.length === 0 && (
            <div className="text-sm text-txt-tertiary italic">
              No listings yet. Add one below.
            </div>
          )}

          {rows.map((row, i) => (
            <div
              key={i}
              className="border border-surface-muted rounded-xl p-3 space-y-2 bg-surface-soft/50"
            >
              <div className="flex items-center justify-between">
                <div className="w-40">
                  <Label>Platform</Label>
                  <Select
                    value={row.platform}
                    onChange={(v) => update(i, "platform", v)}
                    options={PLATFORMS}
                  />
                </div>
                <button
                  onClick={() =>
                    setRows((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-txt-tertiary hover:text-status-red cursor-pointer"
                  title="Remove"
                >
                  <Icon name="delete" className="text-lg" />
                </button>
              </div>
              <div>
                <Label>Listing URL</Label>
                <Input
                  value={row.url}
                  onChange={(v) => update(i, "url", v)}
                  placeholder="https://airbnb.com/rooms/…"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Listing ID (optional)</Label>
                  <Input
                    value={row.listing_id}
                    onChange={(v) => update(i, "listing_id", v)}
                  />
                </div>
                <div>
                  <Label>Contact Email</Label>
                  <Input
                    value={row.contact_email}
                    onChange={(v) => update(i, "contact_email", v)}
                    placeholder="anjeyka+spruce@yahoo.com"
                  />
                </div>
              </div>
              <div>
                <Label>iCal Feed URL</Label>
                <Input
                  value={row.ical_url}
                  onChange={(v) => update(i, "ical_url", v)}
                  placeholder="https://…/ical/xxxxx.ics"
                />
              </div>
            </div>
          ))}

          <Button
            variant="ghost"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            + Add listing
          </Button>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              onClick={async () => {
                setSaving(true);
                await onSave("listings", { rows });
                setSaving(false);
                close();
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </PropertyCard>
  );
}
