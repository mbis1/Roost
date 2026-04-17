"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, TextArea, Button, FormField, Grid2 } from "@/components/ui";

type WifiData = {
  network_name?: string;
  network_password?: string;
  isp_provider?: string;
  isp_account_number?: string;
  isp_billing_contact?: string;
  router_location?: string;
  smart_home_devices?: string;
};

export function WifiTechCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<WifiData>((data as WifiData) || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm((data as WifiData) || {}), [data]);
  const u = (k: keyof WifiData, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const filled = [
    form.network_name,
    form.network_password,
    form.isp_provider,
    form.isp_account_number,
    form.router_location,
  ].filter((x) => x && String(x).trim()).length;
  const status = cardStatus(filled, 5);

  const summary =
    form.network_name && form.network_password
      ? `${form.network_name} / ${form.network_password}`
      : form.network_name || undefined;

  return (
    <PropertyCard
      icon="wifi"
      title="WiFi & Tech"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <div className="space-y-3">
          <Grid2>
            <FormField label="Network Name">
              <Input
                value={form.network_name || ""}
                onChange={(v) => u("network_name", v)}
              />
            </FormField>
            <FormField label="Password">
              <Input
                value={form.network_password || ""}
                onChange={(v) => u("network_password", v)}
              />
            </FormField>
            <FormField label="ISP Provider">
              <Input
                value={form.isp_provider || ""}
                onChange={(v) => u("isp_provider", v)}
                placeholder="Spectrum, Xfinity, Verizon…"
              />
            </FormField>
            <FormField label="ISP Account Number">
              <Input
                value={form.isp_account_number || ""}
                onChange={(v) => u("isp_account_number", v)}
              />
            </FormField>
            <FormField label="ISP Billing Contact" span>
              <Input
                value={form.isp_billing_contact || ""}
                onChange={(v) => u("isp_billing_contact", v)}
                placeholder="800-555-1212 or billing@isp.com"
              />
            </FormField>
            <FormField label="Router Location" span>
              <Input
                value={form.router_location || ""}
                onChange={(v) => u("router_location", v)}
                placeholder="Utility closet off the kitchen"
              />
            </FormField>
          </Grid2>
          <FormField label="Smart Home Devices">
            <TextArea
              value={form.smart_home_devices || ""}
              onChange={(v) => u("smart_home_devices", v)}
              rows={5}
              placeholder={
                "Nest thermostat in hallway (2nd gen)\nRing doorbell at front door\nRoku in living room TV"
              }
            />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              onClick={async () => {
                setSaving(true);
                await onSave("wifi_and_tech", form as Record<string, unknown>);
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
