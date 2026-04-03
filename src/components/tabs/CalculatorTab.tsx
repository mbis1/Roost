"use client";

import { useState } from "react";
import { useProperties, useUserSettings } from "@/lib/hooks";
import { calculateBooking, generateReplyTemplate, checkMonthlyTarget } from "@/lib/calculator";
import { Card, SectionTitle, Label, Input, Select, FormField, Grid2, Dollar } from "@/components/ui";

export function CalculatorTab({ propertyId }: { propertyId?: string }) {
  const { data: properties } = useProperties();
  const { settings } = useUserSettings();
  const [form, setForm] = useState({ propertyId: propertyId || (properties[0]?.id || ""), platform: "Airbnb" as "Airbnb" | "VRBO" | "Direct", nights: 3, customRate: "", discount: 0, extraGuests: 0, extraGuestFee: 0 });

  const prop = properties.find((p) => p.id === form.propertyId);
  const rate = form.customRate ? Number(form.customRate) : (prop?.price_per_night || 0);
  const clean = prop?.cleaning_fee || 0;
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const result = calculateBooking({ platform: form.platform, nightlyRate: rate, nights: form.nights, cleaningFee: clean, discountPercent: form.discount, extraGuests: form.extraGuests, extraGuestFeePerNight: form.extraGuestFee, airbnbHostFeePct: settings?.airbnb_host_fee_pct || 3, airbnbGuestFeePct: settings?.airbnb_guest_fee_pct || 14.2, vrboHostFeePct: settings?.vrbo_host_fee_pct || 5, vrboGuestFeePct: settings?.vrbo_guest_fee_pct || 0, taxRate: settings?.tax_rate || 0 });
  const target = prop?.monthly_target || 0;
  const targetCheck = checkMonthlyTarget(result.effectiveNightlyRate, target);
  const replyTemplate = generateReplyTemplate(result, form.nights, rate);

  return (
    <div className="max-w-3xl">
      <SectionTitle>Booking Calculator</SectionTitle>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {!propertyId && properties.length > 0 && (<div className="col-span-4"><Label>Property</Label><Select value={form.propertyId} onChange={(v) => u("propertyId", v)} options={properties.map((p) => p.id)} /><div className="text-xs text-txt-secondary mt-1">{prop?.name || "Select"}</div></div>)}
        <FormField label="Platform"><Select value={form.platform} onChange={(v) => u("platform", v)} options={["Airbnb", "VRBO", "Direct"]} /></FormField>
        <FormField label="Nights"><Input type="number" value={form.nights} onChange={(v) => u("nights", Number(v) || 0)} /></FormField>
        <FormField label={"Rate ($" + (prop?.price_per_night || 0) + " default)"}><Input type="number" value={form.customRate} onChange={(v) => u("customRate", v)} placeholder={String(prop?.price_per_night || 0)} /></FormField>
        <FormField label="Discount %"><Input type="number" value={form.discount} onChange={(v) => u("discount", Number(v) || 0)} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="text-[11px] font-bold text-txt-secondary uppercase mb-3">Guest Pays</div>
          <div className="space-y-1 text-sm">
            <Row l={"$" + rate + " x " + form.nights + " nights"} v={Dollar(result.subtotal)} />
            <Row l="Cleaning" v={Dollar(result.cleaningFee)} />
            {result.discountAmount > 0 && <Row l="Discount" v={"-" + Dollar(result.discountAmount)} color="text-status-green" />}
            {result.guestServiceFee > 0 && <Row l={form.platform + " fee"} v={Dollar(result.guestServiceFee)} />}
            {result.taxes > 0 && <Row l="Taxes" v={Dollar(result.taxes)} />}
          </div>
          <div className="border-t border-surface-muted mt-3 pt-3 flex justify-between font-extrabold text-lg"><span>Total</span><span>{Dollar(result.guestTotal)}</span></div>
        </Card>
        <Card className="bg-status-green-bg border-green-200">
          <div className="text-[11px] font-bold text-status-green uppercase mb-3">You Receive</div>
          <div className="space-y-1 text-sm"><Row l="Subtotal" v={Dollar(result.preFeeTotal)} /><Row l={"Host fee " + result.hostFeeRate + "%"} v={"-" + Dollar(result.hostServiceFee)} color="text-status-red" /></div>
          <div className="border-t border-green-200 mt-3 pt-3 flex justify-between font-extrabold text-xl text-status-green"><span>Payout</span><span>{Dollar(result.hostPayout)}</span></div>
          <div className="text-xs text-txt-secondary mt-2">{"Effective: $" + result.effectiveNightlyRate.toFixed(2) + "/night"}</div>
          {target > 0 && (<div className="mt-3 p-3 bg-white rounded-lg"><div className="text-[10px] font-bold text-txt-secondary uppercase">{"Monthly Target: $" + target}</div><div className="text-sm mt-1"><span className={targetCheck.achievable ? "text-status-green" : "text-status-red"}>{targetCheck.nightsNeeded + " nights/mo needed"}</span></div></div>)}
        </Card>
      </div>
      <Card className="mt-4"><div className="text-[10px] font-bold text-txt-secondary uppercase mb-2">Reply Template</div><div className="text-sm text-txt-secondary leading-relaxed font-mono bg-surface-soft rounded-lg p-3">{replyTemplate}</div></Card>
    </div>
  );
}

function Row({ l, v, color }: { l: string; v: string; color?: string }) {
  return <div className="flex justify-between"><span className="text-txt-secondary">{l}</span><span className={"font-mono " + (color || "")}>{v}</span></div>;
}
