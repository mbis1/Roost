"use client";

import { useUserSettings } from "@/lib/hooks";
import { Card, SectionTitle, Label, Input, Select, FormField, Grid2 } from "@/components/ui";

export function SettingsTab() {
  const { settings, updateSettings } = useUserSettings();
  if (!settings) return <p className="text-txt-secondary text-sm">Loading settings...</p>;

  const u = (k: string, v: unknown) => updateSettings({ [k]: v } as any);

  return (
    <div className="max-w-xl">
      <SectionTitle>Settings</SectionTitle>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">Platform Fees</div>
        <Grid2>
          <FormField label="Airbnb Host Fee %"><Input type="number" value={settings.airbnb_host_fee_pct} onChange={(v) => u("airbnb_host_fee_pct", Number(v) || 0)} /></FormField>
          <FormField label="Airbnb Guest Fee %"><Input type="number" value={settings.airbnb_guest_fee_pct} onChange={(v) => u("airbnb_guest_fee_pct", Number(v) || 0)} /></FormField>
          <FormField label="VRBO Host Fee %"><Input type="number" value={settings.vrbo_host_fee_pct} onChange={(v) => u("vrbo_host_fee_pct", Number(v) || 0)} /></FormField>
          <FormField label="Tax Rate %"><Input type="number" value={settings.tax_rate} onChange={(v) => u("tax_rate", Number(v) || 0)} /></FormField>
        </Grid2>
        <p className="text-[10px] text-txt-tertiary mt-2">Airbnb default: 3% host / ~14.2% guest. VRBO: ~5% host.</p>
      </Card>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">AI Configuration</div>
        <Grid2>
          <FormField label="AI Provider"><Select value={settings.ai_provider} onChange={(v) => u("ai_provider", v)} options={["huggingface", "groq", "anthropic"]} /></FormField>
          <FormField label="Response Tone"><Select value={settings.ai_tone} onChange={(v) => u("ai_tone", v)} options={["friendly", "formal", "casual"]} /></FormField>
          <FormField label="API Key" span><Input value={settings.ai_api_key} onChange={(v) => u("ai_api_key", v)} placeholder="hf_xxxx or gsk_xxxx" /></FormField>
        </Grid2>
      </Card>

      <Card className="mb-4">
        <div className="font-bold text-sm mb-3">Contact & Payment</div>
        <Grid2>
          <FormField label="Phone"><Input value={settings.phone} onChange={(v) => u("phone", v)} placeholder="+1 555-0000" /></FormField>
          <FormField label="Email"><Input value={settings.email} onChange={(v) => u("email", v)} /></FormField>
          <FormField label="Card Last 4"><Input value={settings.card_last4} onChange={(v) => u("card_last4", v)} placeholder="1234" /></FormField>
        </Grid2>
      </Card>
    </div>
  );
}
