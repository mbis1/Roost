"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, Select, Button, FormField, Grid2 } from "@/components/ui";
import { supabase, type Property } from "@/lib/supabase";

const PROPERTY_TYPES = ["Apartment", "House", "Condo", "Townhouse", "Cabin", "Other"];

/**
 * Overview card — edits columns on the `properties` table directly (not
 * property_details). Acts as the property's identity record.
 */
export function OverviewCard({
  property,
  onUpdated,
}: {
  property: Property;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({ ...property });
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm({ ...property }), [property.id]);
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const filledCount = [
    property.name,
    property.nickname,
    property.address,
    property.property_type,
    property.bedrooms > 0 ? "y" : "",
    property.bathrooms > 0 ? "y" : "",
    property.max_guests > 0 ? "y" : "",
  ].filter(Boolean).length;
  const status = cardStatus(filledCount, 7);

  const summaryParts = [
    property.bedrooms ? `${property.bedrooms}bd` : null,
    property.bathrooms ? `${property.bathrooms}ba` : null,
    property.max_guests ? `sleeps ${property.max_guests}` : null,
    property.property_type && property.property_type !== "Other"
      ? property.property_type
      : null,
  ].filter(Boolean);
  const summary =
    property.address && summaryParts.length > 0
      ? `${property.address} • ${summaryParts.join(" · ")}`
      : property.address || undefined;

  const save = async (close: () => void) => {
    setSaving(true);
    const { error } = await supabase
      .from("properties")
      .update({
        name: form.name,
        nickname: form.nickname,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        max_guests: form.max_guests,
        property_type: form.property_type,
        primary_photo_url: form.primary_photo_url,
      })
      .eq("id", property.id);
    setSaving(false);
    if (error) {
      console.error("Overview save failed:", error);
      return;
    }
    onUpdated();
    close();
  };

  return (
    <PropertyCard
      icon="home_work"
      title="Overview"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <div className="space-y-3">
          <Grid2>
            <FormField label="Name" span>
              <Input value={form.name} onChange={(v) => u("name", v)} />
            </FormField>
            <FormField label="Nickname" span>
              <Input
                value={form.nickname || ""}
                onChange={(v) => u("nickname", v)}
                placeholder="Short internal label"
              />
            </FormField>
            <FormField label="Street Address" span>
              <Input
                value={form.address}
                onChange={(v) => u("address", v)}
              />
            </FormField>
            <FormField label="City">
              <Input value={form.city || ""} onChange={(v) => u("city", v)} />
            </FormField>
            <FormField label="State">
              <Input value={form.state || ""} onChange={(v) => u("state", v)} />
            </FormField>
            <FormField label="ZIP">
              <Input value={form.zip || ""} onChange={(v) => u("zip", v)} />
            </FormField>
            <FormField label="Property Type">
              <Select
                value={form.property_type || "Other"}
                onChange={(v) => u("property_type", v)}
                options={PROPERTY_TYPES}
              />
            </FormField>
            <FormField label="Bedrooms">
              <Input
                type="number"
                value={form.bedrooms}
                onChange={(v) => u("bedrooms", parseInt(v) || 0)}
              />
            </FormField>
            <FormField label="Bathrooms">
              <Input
                type="number"
                value={form.bathrooms}
                onChange={(v) => u("bathrooms", parseFloat(v) || 0)}
              />
            </FormField>
            <FormField label="Max Guests">
              <Input
                type="number"
                value={form.max_guests}
                onChange={(v) => u("max_guests", parseInt(v) || 0)}
              />
            </FormField>
            <FormField label="Primary Photo URL" span>
              <Input
                value={form.primary_photo_url || ""}
                onChange={(v) => u("primary_photo_url", v)}
                placeholder="https://…"
              />
            </FormField>
          </Grid2>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button onClick={() => save(close)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </PropertyCard>
  );
}
