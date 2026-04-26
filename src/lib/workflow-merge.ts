// src/lib/workflow-merge.ts
//
// Sprint B.3 — apply per-step overrides on top of the compiled diagram.
//
// The compiler (Sprint B.2) produces the canonical 11-step diagram from
// settings. Users can override individual fields of a step (execution mode,
// template text, etc.) — those overrides are stored in
// property_workflows.overrides keyed by step id. This helper merges them
// back together for display.

import type { WorkflowStep } from "./workflow-types";

export type WorkflowStepWithMeta = WorkflowStep & {
  _hasOverride?: boolean;
};

export type StepOverride = Partial<WorkflowStep> & {
  edited_at?: string;
};

export function mergeOverrides(
  compiledSteps: WorkflowStep[],
  overrides: Record<string, StepOverride>
): WorkflowStepWithMeta[] {
  return compiledSteps.map((step) => {
    const override = overrides[step.id];
    if (!override) return step;
    // Strip metadata fields that aren't part of the visible step shape.
    const { edited_at: _omit, ...stepFields } = override;
    void _omit;
    return {
      ...step,
      ...stepFields,
      _hasOverride: true,
    } as WorkflowStepWithMeta;
  });
}
