"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, Select, TextArea, Button, FormField, Grid2 } from "@/components/ui";

const LOCK_TYPES = [
  "Yale",
  "August",
  "Schlage",
  "Keypad - generic",
  "Traditional key",
  "Smart lock - other",
];

type AccessData = {
  lock_type?: string;
  current_code?: string;
  code_rule?: string;
  spare_key_location?: string;
  gate_garage_codes?: string;
};

export function AccessLocksCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const initial: AccessData = (data as AccessData) || {};
  const [form, setForm] = useState<AccessData>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm((data as AccessData) || {}), [data]);
  const u = (k: keyof AccessData, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const filled = [
    form.lock_type,
    form.current_code,
    form.code_rule,
    form.spare_key_location,
    form.gate_garage_codes,
  ].filter((x) => x && String(x).trim()).length;
  const status = cardStatus(filled, 5);

  const summary = form.lock_type
    ? `${form.lock_type}${form.current_code ? ` · code ${form.current_code}` : ""}`
    : undefined;

  return (
    <PropertyCard
      icon="lock"
      title="Access & Locks"
      summary={summary}
      status={status}
      full
    >
      {(close) => (
        <div className="space-y-3">
          <Grid2>
            <FormField label="Lock Type">
              <Select
                value={form.lock_type || LOCK_TYPES[0]}
                onChange={(v) => u("lock_type", v)}
                options={LOCK_TYPES}
              />
            </FormField>
            <FormField label="Current Code">
              <Input
                value={form.current_code || ""}
                onChange={(v) => u("current_code", v)}
                placeholder="e.g. 1234#"
              />
            </FormField>
          </Grid2>
          <FormField label="Code Rule (plain English)">
            <TextArea
              value={form.code_rule || ""}
              onChange={(v) => u("code_rule", v)}
              rows={4}
              placeholder={
                "e.g. Code = last 4 digits of guest's phone number. Update the day before check-in. Keep the old code active until check-in day."
              }
            />
          </FormField>
          <FormField label="Spare Key Location">
            <Input
              value={form.spare_key_location || ""}
              onChange={(v) => u("spare_key_location", v)}
              placeholder="Lockbox under deck, code 0420"
            />
          </FormField>
          <FormField label="Gate / Garage Codes">
            <TextArea
              value={form.gate_garage_codes || ""}
              onChange={(v) => u("gate_garage_codes", v)}
              rows={3}
              placeholder="Community gate: 9182. Garage keypad: 4455"
            />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              onClick={async () => {
                setSaving(true);
                await onSave("access_and_locks", form as Record<string, unknown>);
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
