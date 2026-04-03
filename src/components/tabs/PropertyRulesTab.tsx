"use client";

import { useState, useEffect } from "react";
import { usePropertyRules, insertRow, updateRow } from "@/lib/hooks";
import type { Property } from "@/lib/supabase";
import { generateWelcomeLetter } from "@/lib/ai";
import { Card, SectionTitle, Label, Input, TextArea, Button, FormField, Grid2 } from "@/components/ui";

export function PropertyRulesTab({ property }: { property: Property }) {
  const { data: rulesArr, refetch } = usePropertyRules(property.id);
  const rules = rulesArr[0] || null;
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (rules) {
      setForm({
        hoa_name: rules.hoa_name || "", max_guests: String(rules.max_guests || ""),
        quiet_hours: rules.quiet_hours || "", parking_rules: rules.parking_rules || "",
        pet_policy: rules.pet_policy || "", smoking_policy: rules.smoking_policy || "",
        trash_schedule: rules.trash_schedule || "", pool_rules: rules.pool_rules || "",
        additional_rules: rules.additional_rules || "",
        check_in_instructions: rules.check_in_instructions || "",
        check_out_instructions: rules.check_out_instructions || "",
      });
      setDirty(false);
    }
  }, [rules?.id]);

  const u = (k: string, v: string) => { setForm((p) => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    const data = { ...form, max_guests: Number(form.max_guests) || 0, property_id: property.id };
    if (rules) { await updateRow("property_rules", rules.id, data); }
    else { await insertRow("property_rules", data); }
    setDirty(false); refetch();
  };

  const welcomeLetter = generateWelcomeLetter(
    { name: property.name, address: property.address, wifi_name: property.wifi_name, wifi_password: property.wifi_password, lock_code: property.lock_code, check_in_time: property.check_in_time, check_out_time: property.check_out_time },
    { quietHours: form.quiet_hours, parking: form.parking_rules, pets: form.pet_policy, smoking: form.smoking_policy, maxGuests: form.max_guests, checkInInstructions: form.check_in_instructions, checkOutInstructions: form.check_out_instructions }
  );

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <SectionTitle>Rules & HOA</SectionTitle>
        {dirty && <Button onClick={save}>Save Changes</Button>}
      </div>
      <Card className="mb-4 bg-status-blue-bg border-blue-200">
        <p className="text-sm text-status-blue"><b>These rules auto-inject into welcome letters and AI guest responses.</b></p>
      </Card>
      <Grid2>
        <FormField label="HOA Name"><Input value={form.hoa_name || ""} onChange={(v) => u("hoa_name", v)} /></FormField>
        <FormField label="Max Guests"><Input type="number" value={form.max_guests || ""} onChange={(v) => u("max_guests", v)} /></FormField>
        <FormField label="Quiet Hours"><Input value={form.quiet_hours || ""} onChange={(v) => u("quiet_hours", v)} placeholder="10 PM - 8 AM" /></FormField>
        <FormField label="Parking"><Input value={form.parking_rules || ""} onChange={(v) => u("parking_rules", v)} /></FormField>
        <FormField label="Pet Policy"><Input value={form.pet_policy || ""} onChange={(v) => u("pet_policy", v)} /></FormField>
        <FormField label="Smoking Policy"><Input value={form.smoking_policy || ""} onChange={(v) => u("smoking_policy", v)} /></FormField>
        <FormField label="Trash Schedule"><Input value={form.trash_schedule || ""} onChange={(v) => u("trash_schedule", v)} /></FormField>
        <FormField label="Pool / Amenity Rules"><Input value={form.pool_rules || ""} onChange={(v) => u("pool_rules", v)} /></FormField>
        <FormField label="Additional Rules" span><TextArea value={form.additional_rules || ""} onChange={(v) => u("additional_rules", v)} /></FormField>
        <FormField label="Check-in Instructions" span><TextArea value={form.check_in_instructions || ""} onChange={(v) => u("check_in_instructions", v)} placeholder="Step-by-step check-in guide..." /></FormField>
        <FormField label="Check-out Instructions" span><TextArea value={form.check_out_instructions || ""} onChange={(v) => u("check_out_instructions", v)} placeholder="Strip beds, start dishwasher..." /></FormField>
      </Grid2>
      <Card className="mt-5">
        <div className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-3">Welcome Letter Preview</div>
        <div className="text-sm text-txt-secondary leading-7 font-mono whitespace-pre-wrap bg-surface-soft rounded-lg p-4">{welcomeLetter}</div>
      </Card>
    </div>
  );
}
