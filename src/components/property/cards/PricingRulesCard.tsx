"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, Button, FormField, Grid2 } from "@/components/ui";

type PricingData = {
  base_nightly_rate?: number;
  cleaning_fee?: number;
  extra_guest_fee?: number;
  weekly_discount_pct?: number;
  monthly_discount_pct?: number;
  min_nights?: number;
  max_nights?: number;
};

export function PricingRulesCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<PricingData>((data as PricingData) || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm((data as PricingData) || {}), [data]);
  const n = (k: keyof PricingData, v: string) =>
    setForm((p) => ({ ...p, [k]: v === "" ? undefined : parseFloat(v) || 0 }));

  const filled = [
    form.base_nightly_rate,
    form.cleaning_fee,
    form.extra_guest_fee,
    form.weekly_discount_pct,
    form.monthly_discount_pct,
    form.min_nights,
  ].filter((x) => x !== undefined && x !== null).length;
  const status = cardStatus(filled, 6);

  const summary = form.base_nightly_rate
    ? `$${form.base_nightly_rate}/night${
        form.cleaning_fee ? ` + $${form.cleaning_fee} clean` : ""
      }`
    : undefined;

  return (
    <PropertyCard
      icon="sell"
      title="Pricing Rules"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <div className="space-y-3">
          <Grid2>
            <FormField label="Base Nightly Rate ($)">
              <Input
                type="number"
                value={form.base_nightly_rate ?? ""}
                onChange={(v) => n("base_nightly_rate", v)}
              />
            </FormField>
            <FormField label="Cleaning Fee ($)">
              <Input
                type="number"
                value={form.cleaning_fee ?? ""}
                onChange={(v) => n("cleaning_fee", v)}
              />
            </FormField>
            <FormField label="Extra Guest Fee ($)">
              <Input
                type="number"
                value={form.extra_guest_fee ?? ""}
                onChange={(v) => n("extra_guest_fee", v)}
              />
            </FormField>
            <FormField label="Weekly Discount %">
              <Input
                type="number"
                value={form.weekly_discount_pct ?? ""}
                onChange={(v) => n("weekly_discount_pct", v)}
              />
            </FormField>
            <FormField label="Monthly Discount %">
              <Input
                type="number"
                value={form.monthly_discount_pct ?? ""}
                onChange={(v) => n("monthly_discount_pct", v)}
              />
            </FormField>
            <FormField label="Minimum Nights">
              <Input
                type="number"
                value={form.min_nights ?? ""}
                onChange={(v) => n("min_nights", v)}
              />
            </FormField>
            <FormField label="Maximum Nights">
              <Input
                type="number"
                value={form.max_nights ?? ""}
                onChange={(v) => n("max_nights", v)}
              />
            </FormField>
          </Grid2>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              onClick={async () => {
                setSaving(true);
                await onSave("pricing_rules", form as Record<string, unknown>);
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
