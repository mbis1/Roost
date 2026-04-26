// src/app/api/property/[id]/run-step/route.ts
//
// Sprint B.4 — full-loop "Run step now" endpoint.
//
//   POST /api/property/<uuid>/run-step
//   Body: { step_id: string, action_index?: number }
//
// Pipeline:
//   1. Load merged workflow diagram (compiled + overrides) for this
//      property; locate the requested step + action.
//   2. Build a sample resolution context (sample guest data + real
//      property info) and resolve the action's template.
//   3. If AI is configured in user_settings, run refineWorkflowDraft to
//      polish the wording. Otherwise pass the resolved template through
//      unchanged.
//   4. Insert a workflow_runs row (status: pending) capturing both the
//      resolved + the AI-polished text + channel + recipient.
//   5. Send the polished draft to the host's Telegram with [Approve] /
//      [Reject] inline buttons whose callback_data carries the run id.
//   6. Persist the returned Telegram message_id on the run row.
//
// Sprint B.5 will swap step 2's sample context for real booking data and
// have approve/reject actually dispatch (or not) to the guest channel.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mergeOverrides, type StepOverride } from "@/lib/workflow-merge";
import {
  buildSampleContext,
  resolveTemplate,
} from "@/lib/workflow-resolver";
import { refineWorkflowDraft } from "@/lib/ai";
import {
  dispatchWorkflowRunToTelegram,
  getTelegramConfig,
} from "@/lib/telegram";
import type { WorkflowAction, WorkflowStep } from "@/lib/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function channelForAction(action: WorkflowAction): string {
  if (
    action.type === "send_telegram_ping" ||
    action.type === "update_lock_code"
  )
    return "Telegram";
  if (action.type === "send_message_to_guest") return "Airbnb / VRBO";
  if (action.type === "notify_cleaner") return "Text / email";
  return "—";
}

function recipientLabel(action: WorkflowAction): string {
  if (!action.recipient_role) return "—";
  return (
    action.recipient_role.charAt(0).toUpperCase() +
    action.recipient_role.slice(1)
  );
}

function triggerLabel(step: WorkflowStep): string {
  const t = step.trigger;
  if (t.type === "manual") return "Manual";
  if (t.type === "event") return `On ${t.event ?? "event"}`;
  if (t.type === "time_relative") {
    const off = t.offset_hours ?? 0;
    const rel = t.relative_to ?? "event";
    if (off === 0) return `Day-of ${rel}`;
    if (off < 0) return `${Math.abs(off)}h before ${rel}`;
    return `${off}h after ${rel}`;
  }
  return "—";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: { step_id?: string; action_index?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const stepId = body.step_id;
  const actionIndex = body.action_index ?? 0;
  if (!stepId) {
    return NextResponse.json(
      { ok: false, error: "Missing step_id" },
      { status: 400 }
    );
  }

  // ---- 1. Load merged workflow ----
  const { data: workflowRow, error: wErr } = await supabaseAdmin
    .from("property_workflows")
    .select("*")
    .eq("property_id", params.id)
    .maybeSingle();

  if (wErr || !workflowRow) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Workflow not yet compiled for this property. Recompile and try again.",
      },
      { status: 404 }
    );
  }

  const compiledSteps = (workflowRow.steps ?? []) as WorkflowStep[];
  const overrides = (workflowRow.overrides ?? {}) as Record<string, StepOverride>;
  const merged = mergeOverrides(compiledSteps, overrides);
  const step = merged.find((s) => s.id === stepId);
  if (!step) {
    return NextResponse.json(
      { ok: false, error: `Step ${stepId} not found in this property's workflow` },
      { status: 404 }
    );
  }
  const action = step.actions[actionIndex];
  if (!action) {
    return NextResponse.json(
      { ok: false, error: `Action index ${actionIndex} not found on step ${stepId}` },
      { status: 404 }
    );
  }
  if (!action.template) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This action has no template to send. Pick an action with a message body (Edit message in the Workflow tab).",
      },
      { status: 400 }
    );
  }

  // ---- 2. Resolve template against sample context ----
  const ctx = await buildSampleContext(params.id);
  const resolved = resolveTemplate(action.template, ctx);

  // ---- 3. AI refine (optional) ----
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("ai_provider, ai_api_key, ai_tone")
    .limit(1)
    .maybeSingle();
  const provider = (settings?.ai_provider as string) || "";
  const apiKey = (settings?.ai_api_key as string) || "";
  const tone = ((settings?.ai_tone as string) || "friendly") as
    | "friendly"
    | "formal"
    | "casual";

  let polished = resolved;
  let aiUsed = false;
  if (provider && apiKey) {
    try {
      polished = await refineWorkflowDraft({
        rawTemplate: resolved,
        propertyName: ctx.property_name || "your property",
        tone,
        provider,
        apiKey,
      });
      aiUsed = polished.trim() !== resolved.trim();
    } catch (e) {
      console.error("AI refine failed:", e);
      polished = resolved;
    }
  }

  // ---- 4. Insert workflow_runs row (status: pending) ----
  const channel = channelForAction(action);
  const recipient = recipientLabel(action);
  const trigLabel = triggerLabel(step);

  const { data: runRow, error: insErr } = await supabaseAdmin
    .from("workflow_runs")
    .insert({
      property_id: params.id,
      step_id: step.id,
      action_index: actionIndex,
      triggered_by: "manual",
      channel,
      recipient,
      resolved_template: resolved,
      ai_refined_template: polished,
      status: "pending",
    })
    .select("*")
    .single();

  if (insErr || !runRow) {
    return NextResponse.json(
      { ok: false, error: insErr?.message || "Failed to create run row" },
      { status: 500 }
    );
  }

  // ---- 5. Dispatch to Telegram ----
  const config = await getTelegramConfig();
  if (!config) {
    // Persist the run as 'pending' so the user can still see what would
    // have been sent, but flag the dispatch failure to the caller.
    return NextResponse.json(
      {
        ok: false,
        error:
          "Telegram is not configured. Set bot token + chat ID in Settings, then click Run step now again.",
        run_id: runRow.id,
        resolved,
        polished,
        ai_used: aiUsed,
      },
      { status: 400 }
    );
  }

  const dispatch = await dispatchWorkflowRunToTelegram(config, {
    runId: runRow.id,
    propertyName: ctx.property_name,
    stepTitle: step.title,
    channel,
    recipient,
    triggerLabel: trigLabel,
    draft: polished,
  });

  if (!dispatch.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Telegram dispatch failed: ${dispatch.error}`,
        run_id: runRow.id,
        resolved,
        polished,
        ai_used: aiUsed,
      },
      { status: 500 }
    );
  }

  // ---- 6. Persist Telegram message_id on the run ----
  await supabaseAdmin
    .from("workflow_runs")
    .update({
      telegram_chat_id: config.chatId,
      telegram_message_id: dispatch.messageId,
    })
    .eq("id", runRow.id);

  return NextResponse.json({
    ok: true,
    run_id: runRow.id,
    resolved,
    polished,
    ai_used: aiUsed,
    channel,
    recipient,
    telegram_message_id: dispatch.messageId,
  });
}
