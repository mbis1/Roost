// src/components/workflow/StepCard.tsx
//
// Sprint B.3 — single step in the vertical workflow flowchart.

"use client";

import clsx from "clsx";
import { Icon } from "@/components/Icon";
import type { ExecutionMode } from "@/lib/workflow-types";
import type { WorkflowStepWithMeta } from "@/lib/workflow-merge";

const STEP_ICON: Record<string, string> = {
  INQUIRY: "inbox",
  BOOKING_REQUEST: "event",
  ACCEPT: "check_circle",
  WELCOME_MESSAGE: "mail",
  PRE_ARRIVAL_PREP: "key",
  ARRIVAL_DAY: "flight_land",
  DURING_STAY: "chat",
  CHECKOUT_DAY: "flight_takeoff",
  TURNOVER: "cleaning_services",
  REVIEW: "star",
  CLOSE: "archive",
};

export const MODE_META: Record<
  ExecutionMode,
  { label: string; cls: string; dotCls: string }
> = {
  manual: {
    label: "Manual",
    cls: "bg-surface-soft text-txt-secondary border-surface-muted",
    dotCls: "bg-txt-tertiary",
  },
  semi_auto: {
    label: "Semi-auto",
    cls: "bg-brand/10 text-brand border-brand/30",
    dotCls: "bg-brand",
  },
  fully_auto: {
    label: "Auto",
    cls: "bg-status-green-bg text-status-green border-status-green/30",
    dotCls: "bg-status-green",
  },
  skipped: {
    label: "Skipped",
    cls: "bg-surface-soft text-txt-tertiary border-surface-muted",
    dotCls: "bg-surface-muted",
  },
};

export function StepCard({
  step,
  onClick,
  isLast,
}: {
  step: WorkflowStepWithMeta;
  onClick: () => void;
  isLast: boolean;
}) {
  const icon = STEP_ICON[step.id] || "circle";
  const mode = MODE_META[step.execution_mode];
  const isSkipped = step.execution_mode === "skipped" || !step.enabled;
  const firstActionDescription = step.actions[0]?.description ?? "";

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={clsx(
          "w-full text-left rounded-2xl p-4 bg-white/70 backdrop-blur-xl border transition-all cursor-pointer block",
          isSkipped
            ? "border-dashed border-surface-muted opacity-60 hover:opacity-80"
            : "border-surface-muted hover:border-brand hover:shadow-sm hover:-translate-y-px"
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
              isSkipped ? "bg-surface-soft" : "bg-brand/10"
            )}
          >
            <Icon
              name={icon}
              className={clsx(
                "text-xl",
                isSkipped ? "text-txt-tertiary" : "text-brand"
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wide">
                Step {step.order}
              </span>
              <h4
                className={clsx(
                  "text-sm font-extrabold text-txt",
                  isSkipped && "line-through text-txt-tertiary"
                )}
              >
                {step.title}
              </h4>
              {step._hasOverride && (
                <span
                  title="This step has a manual override"
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-status-orange bg-status-orange-bg border border-status-orange/30 px-1.5 py-0.5 rounded uppercase"
                >
                  <Icon name="bolt" className="text-xs" />
                  Override
                </span>
              )}
            </div>

            <p
              className={clsx(
                "text-xs mt-0.5 leading-snug",
                isSkipped ? "text-txt-tertiary" : "text-txt-secondary"
              )}
            >
              {firstActionDescription || step.description}
            </p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={clsx(
                  "inline-flex items-center gap-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide",
                  mode.cls
                )}
              >
                <span
                  className={clsx("w-1.5 h-1.5 rounded-full", mode.dotCls)}
                />
                {mode.label}
              </span>
              {step.actions.length > 1 && (
                <span className="text-[10px] text-txt-tertiary font-semibold uppercase">
                  +{step.actions.length - 1} more action
                  {step.actions.length > 2 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <Icon
            name="chevron_right"
            className="text-base text-txt-tertiary mt-2 flex-shrink-0"
          />
        </div>
      </button>

      {/* Connecting line down to the next card */}
      {!isLast && (
        <div className="flex justify-center py-1.5" aria-hidden>
          <div className="w-px h-6 bg-surface-muted relative">
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-surface-muted" />
          </div>
        </div>
      )}
    </div>
  );
}
