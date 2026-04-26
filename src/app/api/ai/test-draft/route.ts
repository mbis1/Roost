// src/app/api/ai/test-draft/route.ts
//
// Sprint B.4 — exercise the configured AI provider with a tiny sample
// prompt. Used by Settings → "Test AI draft" button to confirm the API
// key works before relying on it in real workflow runs.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { refineWorkflowDraft } from "@/lib/ai";

export const dynamic = "force-dynamic";

const SAMPLE_TEMPLATE =
  "Hi {{guest_name}}, welcome to {{property_nickname}}! " +
  "Check-in is at {{checkin_time}} and your door code is {{lock_code}}. " +
  "WiFi: {{wifi_network}} / {{wifi_password}}. Looking forward to hosting you!";

export async function POST(req: Request) {
  let body: { provider?: string; api_key?: string; tone?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  let provider = (body.provider || "").trim();
  let apiKey = (body.api_key || "").trim();
  let tone = (body.tone || "").trim();

  if (!provider || !apiKey) {
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("ai_provider, ai_api_key, ai_tone")
      .limit(1)
      .maybeSingle();
    if (!provider) provider = (data?.ai_provider as string) || "huggingface";
    if (!apiKey) apiKey = (data?.ai_api_key as string) || "";
    if (!tone) tone = (data?.ai_tone as string) || "friendly";
  }
  if (!tone) tone = "friendly";

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "No API key configured" },
      { status: 400 }
    );
  }

  try {
    const polished = await refineWorkflowDraft({
      rawTemplate: SAMPLE_TEMPLATE,
      propertyName: "Sample Property",
      tone: tone as "friendly" | "formal" | "casual",
      provider,
      apiKey,
    });
    const unchanged = polished.trim() === SAMPLE_TEMPLATE.trim();
    return NextResponse.json({
      ok: true,
      provider,
      tone,
      sample_template: SAMPLE_TEMPLATE,
      polished,
      // If polished === input, the call probably failed silently and we
      // returned the raw template — surface that to the user.
      polished_unchanged: unchanged,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}
