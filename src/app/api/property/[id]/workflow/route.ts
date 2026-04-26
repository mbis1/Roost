// src/app/api/property/[id]/workflow/route.ts
//
// Sprint B.3 — read + override the compiled workflow diagram for a property.
//
//   GET   /api/property/<uuid>/workflow            returns merged diagram
//   PATCH /api/property/<uuid>/workflow            upserts a single step
//                                                   override (or clears one)
//
// The PATCH body shape:
//   { step_id: "WELCOME_MESSAGE", override: { execution_mode: "manual", ... } }
//   { step_id: "WELCOME_MESSAGE", override: null }   // clears override
//
// Server-only — uses supabaseAdmin (service role).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mergeOverrides, type StepOverride } from "@/lib/workflow-merge";
import type { WorkflowStep } from "@/lib/workflow-types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabaseAdmin
    .from("property_workflows")
    .select("*")
    .eq("property_id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Workflow fetch failed", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        error: "Workflow not yet compiled for this property",
        recompile_url: `/api/property/${params.id}/recompile-workflow`,
      },
      { status: 404 }
    );
  }

  const overrides = (data.overrides ?? {}) as Record<string, StepOverride>;
  const compiledSteps = (data.steps ?? []) as WorkflowStep[];
  const merged = mergeOverrides(compiledSteps, overrides);

  return NextResponse.json({
    property_id: data.property_id,
    compiled_at: data.compiled_at,
    source_settings_hash: data.source_settings_hash,
    steps: merged,
    overrides,
    has_overrides: Object.keys(overrides).length > 0,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: { step_id?: string; override?: StepOverride | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const stepId = body.step_id;
  if (!stepId) {
    return NextResponse.json(
      { error: "Missing step_id" },
      { status: 400 }
    );
  }

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("property_workflows")
    .select("overrides")
    .eq("property_id", params.id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: "Workflow lookup failed", details: readErr.message },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      {
        error:
          "Workflow not yet compiled for this property — recompile first",
      },
      { status: 404 }
    );
  }

  const overrides = (existing.overrides ?? {}) as Record<string, StepOverride>;

  if (body.override === null || body.override === undefined) {
    delete overrides[stepId];
  } else {
    overrides[stepId] = {
      ...body.override,
      edited_at: new Date().toISOString(),
    };
  }

  const { error: updErr } = await supabaseAdmin
    .from("property_workflows")
    .update({ overrides })
    .eq("property_id", params.id);

  if (updErr) {
    return NextResponse.json(
      { error: "Override save failed", details: updErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, overrides });
}
