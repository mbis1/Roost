// src/app/api/property/[id]/recompile-workflow/route.ts
//
// Sprint B.2 — manual trigger for re-running the workflow compiler.
//
//   POST /api/property/<uuid>/recompile-workflow
//   GET  /api/property/<uuid>/recompile-workflow   (alias for testing in browser)
//
// Returns the freshly compiled diagram. Persisted to property_workflows.

import { NextResponse } from "next/server";
import { compileAndSaveWorkflow } from "@/lib/workflow-compiler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const diagram = await compileAndSaveWorkflow(params.id);
    return NextResponse.json({ success: true, diagram });
  } catch (err) {
    return NextResponse.json(
      { error: "Recompile failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  return POST(req, ctx);
}
