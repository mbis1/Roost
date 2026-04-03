"use client";

import { useState, useEffect } from "react";
import { useVendors, updateRow } from "@/lib/hooks";
import type { Property } from "@/lib/supabase";
import { Card, SectionTitle, Label, Input, Select, Button, FormField, Grid2, Badge } from "@/components/ui";

export function PropertyInfoTab({ property, onUpdate }: { property: Property; onUpdate: () => void }) {
  const [form, setForm] = useState({ ...property });
  const [dirty, setDirty] = useState(false);
  const { data: allVendors } = useVendors();
  const propVendors = allVendors.filter((v) => v.property_ids.includes(property.id));

  useEffect(() => { setForm({ ...property }); setDirty(false); }, [property.id]);
  const u = (k: string, v: unknown) => { setForm((p: any) => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    await updateRow("properties", property.id, form);
    setDirty(false);
    onUpdate();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <SectionTitle>Info & Access</SectionTitle>
        {dirty && <Button onClick={save}>Save Changes</Button>}
      </div>
      <Grid2>
        <FormField label="Property Name" span><Input value={form.name} onChange={(v) => u("name", v)} /></FormField>
        <FormField label="Address" span><Input value={form.address} onChange={(v) => u("address", v)} /></FormField>
        <FormField label="Price / Night"><Input type="number" value={form.price_per_night} onChange={(v) => u("price_per_night", Number(v) || 0)} /></FormField>
        <FormField label="Cleaning Fee"><Input type="number" value={form.cleaning_fee} onChange={(v) => u("cleaning_fee", Number(v) || 0)} /></FormField>
        <FormField label="WiFi Name"><Input value={form.wifi_name} onChange={(v) => u("wifi_name", v)} /></FormField>
        <FormField label="WiFi Password"><Input value={form.wifi_password} onChange={(v) => u("wifi_password", v)} /></FormField>
        <FormField label="Lock Code"><Input value={form.lock_code} onChange={(v) => u("lock_code", v)} /></FormField>
        <FormField label="Min Nights"><Input type="number" value={form.min_nights} onChange={(v) => u("min_nights", Number(v) || 1)} /></FormField>
        <FormField label="Check-in Time"><Input value={form.check_in_time} onChange={(v) => u("check_in_time", v)} /></FormField>
        <FormField label="Check-out Time"><Input value={form.check_out_time} onChange={(v) => u("check_out_time", v)} /></FormField>
        <FormField label="Monthly Target ($)"><Input type="number" value={form.monthly_target} onChange={(v) => u("monthly_target", Number(v) || 0)} /></FormField>
        <FormField label="Status"><Select value={form.status} onChange={(v) => u("status", v)} options={["listed", "unlisted", "snoozed"]} /></FormField>
        <FormField label="Notes" span><Input value={form.notes} onChange={(v) => u("notes", v)} placeholder="Internal notes..." /></FormField>
      </Grid2>
      <Card className="mt-5 bg-status-green-bg border-green-200">
        <div className="text-xs font-bold text-status-green mb-2">Quick Guest Info (copy-paste)</div>
        <div className="text-sm font-mono leading-7 text-txt-secondary">
          {"WiFi: " + form.wifi_name + " / " + form.wifi_password}<br />
          {"Lock Code: " + form.lock_code}<br />
          {"Check-in: " + form.check_in_time + " | Check-out: " + form.check_out_time}<br />
          {form.address}
        </div>
      </Card>
      {propVendors.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-2">Assigned Vendors</div>
          {propVendors.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-2 border-b border-surface-muted text-sm">
              <div><span className="font-semibold">{v.name}</span><span className="text-txt-secondary">{" . " + v.role + " . " + v.phone + " . " + v.rate}</span></div>
              <Badge color="blue">{v.role}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
