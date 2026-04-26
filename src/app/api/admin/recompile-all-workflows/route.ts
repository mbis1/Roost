// src/app/api/admin/recompile-all-workflows/route.ts
//
// Sprint B.2 — one-shot backfill. Iterates every property and recompiles
// its workflow. Hit this once after deploy so every existing property
// has a property_workflows row. Safe to re-run — compileAndSaveWorkflow
// upserts and preserves overrides.
//
//   POST /api/admin/recompile-all-workflows
//   GET  /api/admin/recompile-all-workflows   (alias for browser testing)

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { compileAndSaveWorkflow } from "@/lib/workflow-compiler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const { data: properties, error } = await supabaseAdmin
      .from("properties")
      .select("id, name");

    if (error) throw new Error(`Property list failed: ${error.message}`);

    const results: Array<{
      property_id: string;
      name: string | null;
      ok: boolean;
      step_count?: number;
      error?: string;
    }> = [];

    for (const p of properties || []) {
      try {
        const diagram = await compileAndSaveWorkflow(p.id);
        results.push({
          property_id: p.id,
          name: (p.name as string) ?? null,
          ok: true,
          step_count: diagram.steps.length,
        });
      } catch (err) {
        results.push({
          property_id: p.id,
          name: (p.name as string) ?? null,
          ok: false,
          error: String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: results.length,
      ok_count: results.filter((r) => r.ok).length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Backfill failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
