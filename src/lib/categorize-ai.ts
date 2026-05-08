// src/lib/categorize-ai.ts
//
// Sprint C.1 — AI fallback for emails the rule pre-filter doesn't catch.
//
// Reads provider + API key from user_settings (same row that powers the
// workflow draft refiner from Sprint B.4). Falls back to env vars only
// if user_settings has nothing. Returns null on any failure — the
// orchestrator (categorize.ts) then assigns "other".

import { supabaseAdmin } from "@/lib/supabase-admin";
import { callLLMText } from "@/lib/ai";
import {
  PRIMARY_TAGS,
  SECONDARY_TAGS,
  isValidPrimaryTag,
  filterValidSecondaryTags,
} from "@/lib/categorize-tags";
import type { Category, CategorizableEmail } from "./categorize-rules";

const SYSTEM_PROMPT =
  "You are an email categorizer for a property-management app. " +
  "Reply with ONLY a single JSON object, no commentary, no markdown fences.";

const PROMPT_TEMPLATE = `Categorize the email below for Joanna, who manages short-term rentals via Airbnb and VRBO. Her main listing is "Discover Your Home Away from Home: 3B/2B Condo" at 611 Glenolden Ct, Cary NC.

PRIMARY TAGS (pick exactly ONE):
${PRIMARY_TAGS.map((t) => `- ${t}`).join("\n")}

SEMANTICS:
- guest_message: a guest of HER property is asking a question / having a conversation
- booking: confirmation / cancellation / modification of a reservation at HER property
- payout: she received money from Airbnb / VRBO / Booking
- review: review received about her hosting, or a review-prompt
- expense: receipt for something she bought related to her properties
- utility: electric / water / gas / internet / trash bill for a property
- vendor: cleaner / handyman / property manager / repair person communication
- mortgage: mortgage statement, payment confirmation, escrow notice
- legal: LLC filings, tax docs, insurance, registered agent
- hoa: HOA notices, association payments, condo association
- platform_notice: Airbnb / VRBO policy updates, terms changes, account warnings
- personal: HER personal travel / banking / subscriptions / login codes — anything unrelated to her property business
- spam: marketing, credit card offers, promos, newsletters
- other: doesn't fit anywhere

SECONDARY TAGS (zero or more): ${SECONDARY_TAGS.filter((t) => !t.startsWith("property:")).join(", ")}

CRITICAL RULE for Airbnb/VRBO emails: if it's about HER hosting (someone booking her property, payouts to her, reviews of her hosting) it is NOT personal. If it's about HER traveling (her trip, her receipt for staying somewhere) it IS personal. Phrases like "your trip" / "your payment" → personal. Guest names, payouts, her listing name → host context.

Return ONLY this JSON shape, no other text:
{"primary_tag": "...", "secondary_tags": [...], "summary": "one short sentence"}

EMAIL:
From: $FROM
Subject: $SUBJECT
Body (first 800 chars): $BODY

JSON:`;

type AIConfig = { provider: string; apiKey: string };

async function loadAIConfig(): Promise<AIConfig | null> {
  try {
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("ai_provider, ai_api_key")
      .limit(1)
      .maybeSingle();
    const provider = (data?.ai_provider as string) || "";
    const apiKey = (data?.ai_api_key as string) || "";
    if (provider && apiKey) return { provider, apiKey };
  } catch {
    /* fall through to env */
  }
  // Env fallback (HF) — for back-compat with the original spec.
  const hfKey = process.env.HUGGINGFACE_API_KEY || "";
  if (hfKey) return { provider: "huggingface", apiKey: hfKey };
  return null;
}

/**
 * Try to extract a JSON object from the model's output. Models sometimes
 * wrap the JSON in prose, code fences, or extra commentary; grab the
 * first {...} block.
 */
function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function categorizeByAI(
  email: CategorizableEmail
): Promise<Category | null> {
  const config = await loadAIConfig();
  if (!config) {
    console.warn("[categorize-ai] No AI provider configured; skipping AI step");
    return null;
  }

  const prompt = PROMPT_TEMPLATE.replace("$FROM", email.from_addr || "")
    .replace("$SUBJECT", email.subject || "")
    .replace("$BODY", (email.body_text || "").slice(0, 800));

  const text = await callLLMText(prompt, {
    provider: config.provider,
    apiKey: config.apiKey,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 200,
  });
  if (!text) return null;

  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const rawPrimary = String(obj.primary_tag || "").trim();
  const rawSecondary = Array.isArray(obj.secondary_tags)
    ? obj.secondary_tags.map((t) => String(t))
    : [];
  const rawSummary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  if (!isValidPrimaryTag(rawPrimary)) {
    console.warn(
      `[categorize-ai] Invalid primary_tag from model: "${rawPrimary}"`
    );
    return null;
  }

  return {
    primary_tag: rawPrimary,
    secondary_tags: filterValidSecondaryTags(rawSecondary),
    source: "ai",
    ai_summary: rawSummary || undefined,
  };
}
