// src/components/workflow/StepDetailDrawer.tsx
//
// Sprint B.3 — slide-in details panel for one workflow step.
// Read-only by default; Edit toggles to a form for overriding mode + template.

"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";
import { Button, Label } from "@/components/ui";
import {
  KVSelect,
  TemplateTextArea,
} from "@/components/property/formkit";
import type { ExecutionMode, WorkflowStep } from "@/lib/workflow-types";
import type { StepOverride, WorkflowStepWithMeta } from "@/lib/workflow-merge";
import { MODE_META } from "./StepCard";

const SOURCE_CARD_LABELS: Record<string, string> = {
  access_and_locks: "Access & Locks card",
  arrival_flow: "Arrival Flow card",
  departure_flow: "Departure Flow card",
  wifi_and_tech: "WiFi & Tech card",
  house_manual: "House Manual card",
  house_rules: "House Rules card",
  amenities_equipment: "Amenities & Equipment card",
  emergency_contacts: "Emergency Contacts card",
};

const MODE_OPTIONS = [
  { value: "manual", label: "Manual — just remind me" },
  { value: "semi_auto", label: "Semi-auto — Telegram ping for approval" },
  {
    value: "fully_auto",
    label: "Fully automated (coming soon)",
    disabled: true,
  },
  { value: "skipped", label: "Skipped — disable this step" },
];

function describeTrigger(step: WorkflowStep): string {
  const t = step.trigger;
  if (t.type === "event") {
    return `When event "${t.event ?? "—"}" fires`;
  }
  if (t.type === "time_relative") {
    const off = t.offset_hours ?? 0;
    const dir = off < 0 ? `${Math.abs(off)}h before` : off > 0 ? `${off}h after` : "at";
    return `${dir} ${t.relative_to ?? "—"} (event: ${t.event ?? "—"})`;
  }
  return "Manual — advanced by user";
}

function describeMode(mode: ExecutionMode): string {
  switch (mode) {
    case "manual":
      return "Roost just reminds you. You execute the action yourself.";
    case "semi_auto":
      return "Roost drafts the action and pings you on Telegram for approval before executing.";
    case "fully_auto":
      return "Roost executes automatically with no approval required.";
    case "skipped":
      return "This step is disabled and will not run for this property.";
  }
}

export function StepDetailDrawer({
  step,
  compiledStep,
  onClose,
  onSaveOverride,
  onClearOverride,
}: {
  /** The (possibly overridden) step to display + edit. */
  step: WorkflowStepWithMeta;
  /** The original compiled step, used as the "reset to default" anchor. */
  compiledStep: WorkflowStep;
  onClose: () => void;
  onSaveOverride: (override: StepOverride) => Promise<void>;
  onClearOverride: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState<ExecutionMode>(step.execution_mode);
  const firstAction = step.actions[0];
  const compiledFirstAction = compiledStep.actions[0];
  const initialTemplate = firstAction?.template ?? "";
  const compiledTemplate = compiledFirstAction?.template ?? "";
  const [editTemplate, setEditTemplate] = useState(initialTemplate);

  const supportsTemplate = !!compiledFirstAction?.template;

  const startEdit = () => {
    setEditMode(step.execution_mode);
    setEditTemplate(initialTemplate);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditMode(step.execution_mode);
    setEditTemplate(initialTemplate);
    setEditing(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      // Build an override payload that only carries fields the user touched.
      const override: StepOverride = {};
      if (editMode !== compiledStep.execution_mode) {
        override.execution_mode = editMode;
        // If user disabled, mirror enabled flag for consistency with compiler.
        override.enabled = editMode !== "skipped";
      }
      if (
        supportsTemplate &&
        editTemplate !== compiledTemplate &&
        firstAction
      ) {
        override.actions = step.actions.map((a, i) =>
          i === 0 ? { ...a, template: editTemplate } : a
        );
      }
      // If override is effectively empty, clear instead of save.
      if (Object.keys(override).length === 0) {
        await onClearOverride();
      } else {
        await onSaveOverride(override);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const resetToCompiled = async () => {
    setSaving(true);
    try {
      await onClearOverride();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const sources = useMemo(
    () =>
      step.source_cards.map((id) => SOURCE_CARD_LABELS[id] || id) || [],
    [step.source_cards]
  );

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wide flex-shrink-0">
              Step {step.order}
            </span>
            <h3 className="text-lg font-extrabold truncate">{step.title}</h3>
            {step._hasOverride && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-status-orange bg-status-orange-bg border border-status-orange/30 px-1.5 py-0.5 rounded uppercase">
                <Icon name="bolt" className="text-xs" />
                Override
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt cursor-pointer flex-shrink-0"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {!editing ? (
            <ReadView
              step={step}
              sources={sources}
              onEdit={startEdit}
              onClearOverride={resetToCompiled}
            />
          ) : (
            <EditView
              step={step}
              compiledStep={compiledStep}
              editMode={editMode}
              setEditMode={setEditMode}
              editTemplate={editTemplate}
              setEditTemplate={setEditTemplate}
              supportsTemplate={supportsTemplate}
              compiledTemplate={compiledTemplate}
              saving={saving}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onResetToCompiled={resetToCompiled}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReadView({
  step,
  sources,
  onEdit,
  onClearOverride,
}: {
  step: WorkflowStepWithMeta;
  sources: string[];
  onEdit: () => void;
  onClearOverride: () => void;
}) {
  const mode = MODE_META[step.execution_mode];
  return (
    <>
      <Section label="Trigger">
        <p className="text-sm text-txt">{describeTrigger(step)}</p>
      </Section>

      <Section label="Execution mode">
        <div
          className={clsx(
            "inline-flex items-center gap-1.5 text-xs font-semibold border px-2 py-1 rounded uppercase tracking-wide",
            mode.cls
          )}
        >
          <span className={clsx("w-1.5 h-1.5 rounded-full", mode.dotCls)} />
          {mode.label}
        </div>
        <p className="text-xs text-txt-secondary mt-2 leading-relaxed">
          {describeMode(step.execution_mode)}
        </p>
      </Section>

      <Section label="Actions">
        <ul className="space-y-2">
          {step.actions.map((a, i) => (
            <li
              key={i}
              className="rounded-lg border border-surface-muted bg-surface-soft/40 p-3"
            >
              <div className="flex items-start gap-2">
                <Icon name="play_arrow" className="text-base text-brand mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">
                    {a.type.replace(/_/g, " ")}
                    {a.recipient_role && (
                      <span className="ml-1 text-txt-tertiary normal-case">
                        → {a.recipient_role}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-txt mt-0.5">{a.description}</p>
                  {a.template && (
                    <pre className="mt-2 px-2.5 py-2 bg-white border border-surface-muted rounded-md text-[11px] font-mono text-txt-secondary whitespace-pre-wrap leading-relaxed">
                      {a.template}
                    </pre>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {step.variables_referenced.length > 0 && (
        <Section label="Variables used">
          <div className="flex flex-wrap gap-1.5">
            {step.variables_referenced.map((v) => (
              <span
                key={v}
                className="text-[11px] px-2 py-0.5 rounded-full bg-surface-soft border border-surface-muted text-txt-secondary font-mono"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </Section>
      )}

      {sources.length > 0 && (
        <Section label="Data sources">
          <ul className="text-sm space-y-0.5">
            {sources.map((s) => (
              <li key={s} className="text-txt-secondary">
                <span className="text-brand mr-1">→</span>
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex gap-2 pt-2 border-t border-surface-muted">
        <Button onClick={onEdit}>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="edit" className="text-sm" />
            Edit step
          </span>
        </Button>
        {step._hasOverride && (
          <Button variant="ghost" onClick={onClearOverride}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="undo" className="text-sm" />
              Reset to compiled default
            </span>
          </Button>
        )}
      </div>

      <p className="text-[11px] text-txt-tertiary leading-relaxed pt-2 border-t border-surface-muted">
        <strong>This step is compiled from settings.</strong> To change the
        default behavior of this step for all properties, edit the source
        cards above. To override just this property, click Edit.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */

function EditView({
  step,
  compiledStep,
  editMode,
  setEditMode,
  editTemplate,
  setEditTemplate,
  supportsTemplate,
  compiledTemplate,
  saving,
  onSave,
  onCancel,
  onResetToCompiled,
}: {
  step: WorkflowStepWithMeta;
  compiledStep: WorkflowStep;
  editMode: ExecutionMode;
  setEditMode: (m: ExecutionMode) => void;
  editTemplate: string;
  setEditTemplate: (s: string) => void;
  supportsTemplate: boolean;
  compiledTemplate: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onResetToCompiled: () => void;
}) {
  return (
    <>
      <div>
        <Label>Execution mode</Label>
        <KVSelect
          value={editMode}
          onChange={(v) => setEditMode(v as ExecutionMode)}
          options={MODE_OPTIONS}
        />
        <p className="text-[11px] text-txt-tertiary mt-1.5 leading-relaxed">
          {describeMode(editMode)}
        </p>
      </div>

      {supportsTemplate && (
        <TemplateTextArea
          label="Message template"
          value={editTemplate}
          onChange={setEditTemplate}
          defaultValue={compiledTemplate}
          rows={9}
        />
      )}

      <div className="rounded-lg border border-surface-muted bg-surface-soft/40 p-3 text-[11px] text-txt-secondary">
        <p className="font-semibold uppercase tracking-wide text-txt-tertiary mb-1">
          Read-only in this sprint
        </p>
        <p className="leading-relaxed">
          Trigger ({compiledStep.trigger.type}) and the other action types are
          locked here for now. Override editing for triggers and additional
          actions ships in a later sprint.
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-surface-muted">
        {step._hasOverride && (
          <Button variant="ghost" onClick={onResetToCompiled}>
            Reset to compiled default
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>{saving ? "Saving…" : "Save override"}</Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-txt-tertiary uppercase tracking-wide mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}
