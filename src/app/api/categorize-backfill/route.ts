// src/app/api/categorize-backfill/route.ts
//
// Sprint C.1 — categorize existing emails that were ingested before C.1
// shipped (or any future rows that landed without a primary_tag for any
// reason). Idempotent. Hit it repeatedly; eventually `processed: 0`.
//
//   GET  /api/categorize-backfill            (defaults to limit=50)
//   GET  /api/categorize-backfill?limit=200
//   POST same shape (alias)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { categorizeEmail } from "@/lib/categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1),
    500
  );

  const { data: emails, error } = await supabaseAdmin
    .from("emails")
    .select("id, from_addr, subject, body_text")
    .is("primary_tag", null)
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
  if (!emails || emails.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nothing to backfill",
      processed: 0,
    });
  }

  let ruleHits = 0;
  let aiHits = 0;
  let fallthroughs = 0;
  const errors: string[] = [];

  for (const email of emails) {
    try {
      const category = await categorizeEmail({
        from_addr: (email.from_addr as string) || "",
        subject: (email.subject as string) || "",
        body_text: (email.body_text as string) || "",
      });

      const { error: updErr } = await supabaseAdmin
        .from("emails")
        .update({
          primary_tag: category.primary_tag,
          secondary_tags: category.secondary_tags,
          ai_summary: category.ai_summary || null,
        })
        .eq("id", email.id);

      if (updErr) {
        errors.push(`${email.id}: update failed: ${updErr.message}`);
        continue;
      }

      try {
        await supabaseAdmin.from("categorization_log").insert({
          email_id: email.id,
          primary_tag: category.primary_tag,
          secondary_tags: category.secondary_tags,
          source: category.source,
          rule_id: category.rule_id || null,
          ai_summary: category.ai_summary || null,
        });
      } catch (logErr) {
        errors.push(`${email.id}: cat_log: ${String(logErr)}`);
      }

      if (category.source === "rule") ruleHits++;
      else if (category.source === "ai") aiHits++;
      if (category.rule_id === "fallthrough") fallthroughs++;
    } catch (err) {
      errors.push(`${email.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: emails.length,
    rule_hits: ruleHits,
    ai_hits: aiHits,
    fallthroughs,
    errors,
    message: `Categorized ${emails.length} emails. Hit again for the next batch.`,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
