// src/components/views/WorkflowView.tsx
//
// Sprint B.3 — Workflow tab content. Renders the compiled-and-merged
// 11-step diagram as a vertical flowchart.

"use client";

import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useProperty, useWorkflow } from "@/lib/hooks";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { StepCard } from "@/components/workflow/StepCard";
import { StepDetailDrawer } from "@/components/workflow/StepDetailDrawer";
import type { WorkflowStep } from "@/lib/workflow-types";
import type { StepOverride } from "@/lib/workflow-merge";

export function WorkflowView({ propertyId }: { propertyId: string }) {
  const { data: property } = useProperty(propertyId);
  const {
    diagram,
    loading,
    error,
    recompile,
    saveOverride,
    clearOverride,
  } = useWorkflow(propertyId);
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [recompiling, setRecompiling] = useState(false);

  const compiledStepsById = useMemo(() => {
    // To find the *compiled* (un-overridden) version of a step, we re-derive
    // it from the override-stripped fields stored alongside the response.
    // The merged step has _hasOverride; the original compiled fields aren't
    // sent back individually. So we approximate by treating any non-override
    // step as the compiled view, and for overridden steps we synthesize the
    // compiled view by merging the action+mode back from the response's
    // overrides map (server returns the originals via diagram.steps before
    // merge, but we already merged client-side via the API). Simpler:
    // recompute by stripping override-derived fields if needed.
    //
    // For this sprint we keep it simple: the merged step IS the source of
    // truth for the read view, and the "compiled default" the user resets to
    // is whatever lives in property_workflows.steps (which the server merges
    // before returning). For Reset-to-default we just call clearOverride —
    // the server holds the canonical compiled steps in the steps column.
    const map: Record<string, WorkflowStep> = {};
    for (const s of diagram?.steps ?? []) {
      // Deep clone strips _hasOverride and gives us a stable per-id reference.
      const { _hasOverride: _omit, ...rest } = s as WorkflowStep & {
        _hasOverride?: boolean;
      };
      void _omit;
      map[s.id] = rest as WorkflowStep;
    }
    return map;
  }, [diagram?.steps]);

  const handleRecompile = async () => {
    setRecompiling(true);
    try {
      await recompile();
    } finally {
      setRecompiling(false);
    }
  };

  const openStep = openStepId
    ? diagram?.steps.find((s) => s.id === openStepId)
    : null;
  const openStepCompiled = openStep ? compiledStepsById[openStep.id] : null;

  const allSkipped =
    diagram &&
    diagram.steps.length > 0 &&
    diagram.steps.every(
      (s) => s.execution_mode === "skipped" || !s.enabled
    );

  /* --------- Empty / error states --------- */

  if (loading && !diagram) {
    return (
      <p className="text-sm text-txt-secondary">Loading workflow…</p>
    );
  }

  if (!diagram && error) {
    return (
      <div className="max-w-2xl">
        <Header
          propertyName={property?.nickname || property?.name || "Property"}
          compiledAt={null}
          recompiling={recompiling}
          onRecompile={handleRecompile}
          hasOverrides={false}
        />
        <div className="rounded-2xl border border-dashed border-surface-muted bg-white/60 p-8 text-center">
          <Icon
            name="account_tree"
            className="text-4xl text-txt-tertiary mb-2 inline-block"
          />
          <h3 className="text-base font-extrabold text-txt mb-1">
            No workflow compiled yet
          </h3>
          <p className="text-sm text-txt-secondary mb-4 max-w-md mx-auto">
            {error}
          </p>
          <Button onClick={handleRecompile}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="refresh" className="text-sm" />
              {recompiling ? "Compiling…" : "Compile workflow"}
            </span>
          </Button>
        </div>
      </div>
    );
  }

  /* --------- Main flowchart --------- */

  return (
    <div className="max-w-3xl">
      <Header
        propertyName={property?.nickname || property?.name || "Property"}
        compiledAt={diagram?.compiled_at ?? null}
        recompiling={recompiling}
        onRecompile={handleRecompile}
        hasOverrides={diagram?.has_overrides ?? false}
      />

      {allSkipped && (
        <div className="mb-4 rounded-xl border border-status-orange/30 bg-status-orange-bg/40 px-4 py-3 text-xs text-status-orange">
          <strong>All steps are currently disabled.</strong> Enable features
          in the Operations / Business cards to activate workflow steps.
        </div>
      )}

      <div className="space-y-0">
        {diagram?.steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            isLast={i === diagram.steps.length - 1}
            onClick={() => setOpenStepId(step.id)}
          />
        ))}
      </div>

      {openStep && openStepCompiled && (
        <StepDetailDrawer
          step={openStep}
          compiledStep={openStepCompiled}
          onClose={() => setOpenStepId(null)}
          onSaveOverride={async (override: StepOverride) => {
            await saveOverride(openStep.id, override);
          }}
          onClearOverride={async () => {
            await clearOverride(openStep.id);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header({
  propertyName,
  compiledAt,
  recompiling,
  onRecompile,
  hasOverrides,
}: {
  propertyName: string;
  compiledAt: string | null;
  recompiling: boolean;
  onRecompile: () => void;
  hasOverrides: boolean;
}) {
  let relative = "—";
  if (compiledAt) {
    try {
      relative = formatDistanceToNow(new Date(compiledAt), {
        addSuffix: true,
      });
    } catch {
      relative = compiledAt;
    }
  }
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl p-5 mb-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Icon name="account_tree" className="text-2xl text-brand" />
            Workflow
            <span className="text-base font-medium text-txt-secondary">
              · {propertyName}
            </span>
          </h1>
          <p className="text-xs text-txt-secondary mt-1">
            Last compiled {relative}. Auto-recompiles when you change
            Operations or Business settings. Manual overrides are preserved
            across recompiles.
            {hasOverrides && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-status-orange font-semibold">
                <Icon name="bolt" className="text-xs" />
                This property has overrides.
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" onClick={onRecompile}>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="refresh" className="text-sm" />
            {recompiling ? "Recompiling…" : "Recompile"}
          </span>
        </Button>
      </div>
    </div>
  );
}
