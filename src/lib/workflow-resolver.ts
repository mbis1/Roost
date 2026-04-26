// src/lib/workflow-resolver.ts
//
// Sprint B.4 — variable resolution for workflow templates.
//
// Pure-ish helpers that transform a template string with {{placeholder}}
// tokens into a fully-rendered string. The compiler emits raw templates;
// the executor resolves them right before dispatch.
//
// For B.4 the booking-specific variables (guest_name, checkin_date, etc.)
// are filled with sample values when the user clicks "Run step now". B.5
// will plug a real booking row in.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Property } from "@/lib/supabase";

export type ResolveContext = Record<string, string>;

/** Replace `{{name}}` tokens. Unknown tokens are left intact so the user
 *  can still see them in previews and know what wasn't resolved. */
export function resolveTemplate(
  template: string,
  ctx: ResolveContext
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (full, key) => {
    const v = ctx[key];
    return v === undefined || v === null || v === "" ? full : String(v);
  });
}

/** List the {{var}} keys referenced in a template. Stable order, deduped. */
export function listVariables(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = Array.from(template.matchAll(/\{\{(\w+)\}\}/g));
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Build a sample resolution context using real values from the property
 *  row + sensible placeholders for the guest/booking variables. The result
 *  is what's used by the "Run step now" preview path. */
export async function buildSampleContext(
  propertyId: string
): Promise<ResolveContext> {
  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  const p = (property || {}) as Partial<Property>;

  // Compute fake checkin/checkout dates 3 days out, 6 days out for a
  // 3-night sample stay.
  const today = new Date();
  const checkin = new Date(today);
  checkin.setDate(today.getDate() + 3);
  const checkout = new Date(today);
  checkout.setDate(today.getDate() + 6);
  const nextCheckin = new Date(today);
  nextCheckin.setDate(today.getDate() + 8);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  return {
    // Guest-side (sample)
    guest_name: "Jane Doe",
    guest_phone_last_4: "4321",
    cleaner_name: "Maria",
    host_name: "You",

    // Booking dates (sample, computed from today)
    checkin_date: fmtDate(checkin),
    checkout_date: fmtDate(checkout),
    next_checkin_date: fmtDate(nextCheckin),
    nights_count: "3",

    // Property-side (real, where we have it; placeholders otherwise)
    property_name: p.name || "[property name]",
    property_nickname: p.nickname || p.name || "[property]",
    property_address: p.address || "[address]",
    wifi_network: p.wifi_name || "[wifi network]",
    wifi_password: p.wifi_password || "[wifi password]",
    lock_code: p.lock_code || "1234",
    checkin_time: p.check_in_time || "4:00 PM",
    checkout_time: p.check_out_time || "11:00 AM",
  };
}
