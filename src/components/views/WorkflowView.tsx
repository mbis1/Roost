// src/components/views/WorkflowView.tsx
//
// Sprint B.3.5 — two-column deliverables editor. Left column: phase-grouped
// step list. Right column: sticky pane that animates in when a step is
// selected and shows the deliverables (actions) with {{var}} highlighting.
//
// Layout behavior:
//   - No step selected → list is centered, pane is hidden.
//   - Step selected → list snaps to the left, pane slides in from the left
//     (-12px → 0, 240ms) and shows the deliverables editor.
//
// Editing:
//   - Each deliverable card has an "Edit message" button that swaps the
//     template for an inline editor (textarea + variable chips).
//   - Save persists the override to property_workflows.overrides via
//     PATCH /api/property/[id]/workflow. The merged diagram is refetched.
//   - Steps with overrides show an "EDITED" tag in the list and a
//     "Reset to compiled default" button at the bottom of the pane.
//
// Reads from GET /api/property/[id]/workflow (which already merges overrides
// server-side and tags overridden steps with _hasOverride).

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "../workflow/workflow.module.css";
import type {
  WorkflowStep,
  WorkflowAction,
} from "@/lib/workflow-types";

type StepWithMeta = WorkflowStep & { _hasOverride?: boolean };

type Props = {
  propertyId: string;
};

const PHASES: { label: string; stepIds: string[] }[] = [
  { label: "Pre-booking", stepIds: ["INQUIRY", "BOOKING_REQUEST", "ACCEPT"] },
  {
    label: "Pre-arrival",
    stepIds: ["WELCOME_MESSAGE", "PRE_ARRIVAL_PREP", "ARRIVAL_DAY"],
  },
  { label: "Stay", stepIds: ["DURING_STAY", "CHECKOUT_DAY", "TURNOVER"] },
  { label: "Post-stay", stepIds: ["REVIEW", "CLOSE"] },
];

const STEP_ORDER: Record<string, string> = {
  INQUIRY: "01",
  BOOKING_REQUEST: "02",
  ACCEPT: "03",
  WELCOME_MESSAGE: "04",
  PRE_ARRIVAL_PREP: "05",
  ARRIVAL_DAY: "06",
  DURING_STAY: "07",
  CHECKOUT_DAY: "08",
  TURNOVER: "09",
  REVIEW: "10",
  CLOSE: "11",
};

const SOURCE_LABELS: Record<string, string> = {
  arrival_flow: "Arrival flow",
  departure_flow: "Departure flow",
  access_and_locks: "Access & locks",
  wifi_and_tech: "WiFi & tech",
  house_rules: "House rules",
  vendors: "Vendors",
};

// Variable chips a user can insert into a template at the current cursor
// position. Same set as the Sprint B.1 formkit chips.
const TEMPLATE_VARIABLES: string[] = [
  "guest_name",
  "guest_phone_last_4",
  "checkin_date",
  "checkout_date",
  "checkin_time",
  "checkout_time",
  "nights_count",
  "property_name",
  "property_nickname",
  "property_address",
  "wifi_network",
  "wifi_password",
  "lock_code",
  "cleaner_name",
  "host_name",
  "next_checkin_date",
];

export default function WorkflowView({ propertyId }: Props) {
  const [steps, setSteps] = useState<StepWithMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paneVisible, setPaneVisible] = useState(false);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchSteps = useCallback(async () => {
    try {
      const r = await fetch(`/api/property/${propertyId}/workflow`);
      const data = await r.json();
      setSteps((data.steps || []) as StepWithMeta[]);
    } catch {
      setSteps([]);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openId) {
        setOpenId(null);
        setPaneVisible(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openId]);

  const openStep = useMemo(
    () => steps?.find((s) => s.id === openId) ?? null,
    [steps, openId]
  );

  function toggleStep(id: string) {
    if (openId === id) {
      setOpenId(null);
      setPaneVisible(false);
      return;
    }
    setOpenId(id);
    setPaneVisible(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPaneVisible(true));
    });
    stepRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  // PATCH override (or clear it when override === null) and refetch.
  const saveOverride = useCallback(
    async (
      stepId: string,
      override: Partial<WorkflowStep> | null
    ): Promise<void> => {
      const r = await fetch(`/api/property/${propertyId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: stepId, override }),
      });
      if (!r.ok) {
        let msg = `Save failed (${r.status})`;
        try {
          const body = await r.json();
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      await fetchSteps();
    },
    [propertyId, fetchSteps]
  );

  if (steps === null)
    return (
      <div className={styles.wfPaneEmpty}>Loading workflow…</div>
    );
  if (steps.length === 0)
    return (
      <div className={styles.wfPaneEmpty}>
        No workflow compiled yet. Click recompile to generate.
      </div>
    );

  return (
    <>
      <h2 className="sr-only">
        Workflow diagram. Steps on the left. Deliverables editor on the right.
      </h2>
      <div className={styles.wf}>
        <div
          className={`${styles.wfList} ${openId ? styles.isDimmed : ""}`}
        >
          {PHASES.map((phase) => (
            <div key={phase.label} className={styles.wfPhase}>
              <div className={styles.wfPhaseLabel}>{phase.label}</div>
              <div className={styles.wfPhaseLine} />
              {phase.stepIds.map((id, idx) => {
                const step = steps.find((s) => s.id === id);
                if (!step) return null;
                return (
                  <div key={id}>
                    <StepCard
                      step={step}
                      isOpen={openId === id}
                      onClick={() => toggleStep(id)}
                      stepRef={(el) => {
                        stepRefs.current[id] = el;
                      }}
                    />
                    {idx < phase.stepIds.length - 1 && (
                      <div className={styles.wfConnector} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <Legend />
        </div>

        {openStep && (
          <div className={styles.wfPane}>
            <DeliverablesPane
              step={openStep}
              visible={paneVisible}
              onClose={() => {
                setOpenId(null);
                setPaneVisible(false);
              }}
              onSaveOverride={(override) => saveOverride(openStep.id, override)}
              onClearOverride={() => saveOverride(openStep.id, null)}
            />
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function StepCard({
  step,
  isOpen,
  onClick,
  stepRef,
}: {
  step: StepWithMeta;
  isOpen: boolean;
  onClick: () => void;
  stepRef: (el: HTMLDivElement | null) => void;
}) {
  const dotClass =
    step.execution_mode === "manual"
      ? styles.wfDotManual
      : step.execution_mode === "semi_auto"
      ? styles.wfDotSemi
      : step.execution_mode === "fully_auto"
      ? styles.wfDotAuto
      : styles.wfDotSkipped;

  const badgeClass =
    step.execution_mode === "manual"
      ? styles.wfBadgeManual
      : step.execution_mode === "semi_auto"
      ? styles.wfBadgeSemi
      : step.execution_mode === "fully_auto"
      ? styles.wfBadgeAuto
      : styles.wfBadgeSkipped;

  const badgeText =
    step.execution_mode === "manual"
      ? "Manual"
      : step.execution_mode === "semi_auto"
      ? "Semi-auto"
      : step.execution_mode === "fully_auto"
      ? "Auto"
      : "Skipped";

  const summary = stepSummary(step);

  return (
    <div
      ref={stepRef}
      className={`${styles.wfStep} ${isOpen ? styles.isOpen : ""} ${
        !step.enabled ? styles.isSkipped : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className={styles.wfHead}>
        <span className={`${styles.wfDot} ${dotClass}`} />
        <span className={styles.wfNum}>{STEP_ORDER[step.id] || ""}</span>
        <span className={styles.wfTitle}>{step.title}</span>
        {step._hasOverride && (
          <span
            className={styles.wfOverrideTag}
            title="This step has a manual override"
          >
            Edited
          </span>
        )}
        <div className={styles.wfMeta}>
          <span className={`${styles.wfBadge} ${badgeClass}`}>
            {badgeText}
          </span>
          <span className={styles.wfChev}>›</span>
        </div>
      </div>
      <div className={styles.wfSummary}>{summary}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DeliverablesPane({
  step,
  visible,
  onClose,
  onSaveOverride,
  onClearOverride,
}: {
  step: StepWithMeta;
  visible: boolean;
  onClose: () => void;
  onSaveOverride: (override: Partial<WorkflowStep>) => Promise<void>;
  onClearOverride: () => Promise<void>;
}) {
  const realActions = step.actions.filter((a) => a.type !== "noop");
  const channel = formatChannel(realActions);
  const trigger = formatTrigger(step);

  // Edit state lives at the pane level so we can build the full
  // override (which always sends the entire actions array).
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Reset edit state if the user switches to a different step.
  useEffect(() => {
    setEditingIdx(null);
    setEditText("");
    setError(null);
  }, [step.id]);

  const startEdit = (idx: number, currentText: string) => {
    setEditingIdx(idx);
    setEditText(currentText);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditText("");
    setError(null);
  };

  const saveEdit = async () => {
    if (editingIdx === null) return;
    setSaving(true);
    setError(null);
    try {
      // The merged step's actions array is what we want to send (with
      // the edited template substituted at the right index). The server
      // stores it as the override, replacing whatever was there before.
      const newActions = step.actions.map((a, i) =>
        i === editingIdx ? { ...a, template: editText } : a
      );
      await onSaveOverride({ actions: newActions });
      setEditingIdx(null);
      setEditText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setResetting(true);
    setError(null);
    try {
      await onClearOverride();
      setEditingIdx(null);
      setEditText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className={`${styles.wfPaneCard} ${visible ? styles.isVisible : ""}`}>
      <div className={styles.wfPaneHead}>
        <span className={styles.wfPaneNum}>{STEP_ORDER[step.id] || ""}</span>
        <span className={styles.wfPaneTitle}>{step.title}</span>
        {step._hasOverride && (
          <span className={styles.wfOverrideTag}>Edited</span>
        )}
        <button
          className={styles.wfPaneClose}
          onClick={onClose}
          aria-label="Close deliverables panel"
        >
          ×
        </button>
      </div>

      <div className={styles.wfPaneOverview}>
        <span>
          <strong>Trigger:</strong> {trigger}
        </span>
        <span>
          <strong>Channel:</strong> {channel}
        </span>
        <span>
          <strong>Deliverables:</strong> {realActions.length}
        </span>
      </div>

      {realActions.length === 0 ? (
        <div className={styles.wfNoDeliv}>{noteForEmptyStep(step)}</div>
      ) : (
        realActions.map((action, i) => {
          // Find this real-action's index inside the *full* actions array
          // so override save targets the right slot. realActions is a
          // filtered view — actionIdx is the position in step.actions.
          const actionIdx = step.actions.indexOf(action);
          return (
            <DeliverableCard
              key={`${step.id}-${i}`}
              action={action}
              step={step}
              isEditing={editingIdx === actionIdx}
              editText={editText}
              saving={saving}
              onStartEdit={() => startEdit(actionIdx, action.template ?? "")}
              onTextChange={setEditText}
              onCancelEdit={cancelEdit}
              onSaveEdit={saveEdit}
            />
          );
        })
      )}

      {error && <div className={styles.wfErrorMsg}>{error}</div>}

      {step._hasOverride && editingIdx === null && (
        <div className={styles.wfResetRow}>
          <button
            className={styles.wfEditBtn}
            onClick={resetToDefault}
            disabled={resetting}
          >
            {resetting ? "Resetting…" : "↺  Reset to compiled default"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DeliverableCard({
  action,
  step,
  isEditing,
  editText,
  saving,
  onStartEdit,
  onTextChange,
  onCancelEdit,
  onSaveEdit,
}: {
  action: WorkflowAction;
  step: StepWithMeta;
  isEditing: boolean;
  editText: string;
  saving: boolean;
  onStartEdit: () => void;
  onTextChange: (next: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const icon =
    action.type === "send_message_to_guest"
      ? "→"
      : action.type === "send_telegram_ping" ||
        action.type === "update_lock_code"
      ? "↗"
      : action.type === "notify_cleaner"
      ? "→"
      : "•";

  const channel = channelForAction(action);
  const recipient = action.recipient_role
    ? action.recipient_role.charAt(0).toUpperCase() +
      action.recipient_role.slice(1)
    : "—";

  const sources = step.source_cards
    .map((c) => SOURCE_LABELS[c] || c)
    .join(" · ");

  const insertVariable = (key: string) => {
    const ta = textareaRef.current;
    const token = `{{${key}}}`;
    const start = ta?.selectionStart ?? editText.length;
    const end = ta?.selectionEnd ?? editText.length;
    const next = editText.slice(0, start) + token + editText.slice(end);
    onTextChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={styles.wfDeliv}>
      <div className={styles.wfDelivHead}>
        <span className={styles.wfDelivIcon}>{icon}</span>
        <span>{action.description}</span>
        <span className={styles.wfDelivTrigger}>{formatTrigger(step)}</span>
      </div>

      {isEditing ? (
        <>
          {action.template !== undefined && (
            <>
              <div className={styles.wfHint}>
                Click a variable to insert at cursor:
              </div>
              <div className={styles.wfChipBar}>
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={styles.wfChip}
                    onClick={() => insertVariable(v)}
                    title={`Insert {{${v}}}`}
                  >
                    {v.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className={styles.wfTextarea}
                value={editText}
                onChange={(e) => onTextChange(e.target.value)}
                rows={Math.max(6, editText.split("\n").length + 1)}
              />
            </>
          )}
          <div className={styles.wfEditActions}>
            <button
              className={styles.wfEditBtn}
              onClick={onCancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className={styles.wfBtnPrimary}
              onClick={onSaveEdit}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      ) : (
        <>
          {action.template && (
            <div className={styles.wfDelivBody}>
              <HighlightVars text={action.template} />
            </div>
          )}
          <div className={styles.wfDelivMeta}>
            <span>
              <strong>Channel:</strong> {channel}
            </span>
            <span>
              <strong>Recipient:</strong> {recipient}
            </span>
          </div>
          {sources && <div className={styles.wfSource}>Sources: {sources}</div>}
          {action.template !== undefined && (
            <div className={styles.wfDelivActions}>
              <button className={styles.wfEditBtn} onClick={onStartEdit}>
                Edit message
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HighlightVars({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{\w+\}\}$/.test(p) ? (
          <span key={i} className={styles.wfVar}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function Legend() {
  return (
    <div className={styles.wfLegend}>
      <div className={styles.wfLegendItem}>
        <span className={`${styles.wfDot} ${styles.wfDotManual}`} />
        Manual
      </div>
      <div className={styles.wfLegendItem}>
        <span className={`${styles.wfDot} ${styles.wfDotSemi}`} />
        Semi-auto
      </div>
      <div className={styles.wfLegendItem}>
        <span className={`${styles.wfDot} ${styles.wfDotAuto}`} />
        Auto
      </div>
      <div className={styles.wfLegendItem}>
        <span className={`${styles.wfDot} ${styles.wfDotSkipped}`} />
        Skipped
      </div>
    </div>
  );
}

/* ----- summary / formatting helpers ------------------------------- */

function stepSummary(step: StepWithMeta): string {
  if (!step.enabled) return summaryWhenSkipped(step);
  const real = step.actions.filter((a) => a.type !== "noop");
  if (real.length === 0) return step.description || "No automated deliverables";
  if (real.length === 1) {
    const a = real[0];
    if (a.type === "send_message_to_guest")
      return "1 deliverable · message to guest";
    if (a.type === "send_telegram_ping")
      return "1 deliverable · Telegram ping";
    if (a.type === "update_lock_code")
      return "1 deliverable · lock code update";
    if (a.type === "notify_cleaner")
      return "1 deliverable · cleaner notification";
    return "1 deliverable";
  }
  return `${real.length} deliverables`;
}

function summaryWhenSkipped(step: StepWithMeta): string {
  if (step.id === "ARRIVAL_DAY") return "Pre-arrival reminder is off";
  return "Skipped";
}

function noteForEmptyStep(step: StepWithMeta): string {
  if (step.id === "INQUIRY")
    return "Handled in Messages tab. AI drafter assists in B.4+.";
  if (step.id === "ACCEPT")
    return "Approve in Airbnb / VRBO. No automated deliverables.";
  if (step.id === "DURING_STAY")
    return "Messages tab handles questions. AI drafter assists in B.4+.";
  if (step.id === "TURNOVER")
    return "No automated deliverables. Cleaner already notified in step 5.";
  if (step.id === "REVIEW") return "Manual reminder. Auto-draft coming in B.4+.";
  if (step.id === "CLOSE") return "Internal archive only. No message sent.";
  if (step.id === "ARRIVAL_DAY")
    return "Enable in Operations → Arrival flow → Pre-arrival reminder";
  return "No deliverables.";
}

function formatChannel(actions: WorkflowAction[]): string {
  const types = new Set(actions.map((a) => a.type));
  if (types.size === 0) return "—";
  if (types.size > 1) return "Multiple";
  const t = Array.from(types)[0];
  if (t === "send_telegram_ping" || t === "update_lock_code") return "Telegram";
  if (t === "send_message_to_guest") return "Airbnb / VRBO";
  if (t === "notify_cleaner") return "Text / email";
  return "—";
}

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

function formatTrigger(step: StepWithMeta): string {
  const t = step.trigger;
  if (t.type === "manual") return "Manual";
  if (t.type === "event") {
    if (t.event === "booking_accepted") return "On booking accepted";
    if (t.event === "booking_request_email_received")
      return "On booking email arrival";
    if (t.event === "inquiry_email_received") return "On inquiry arrival";
    if (t.event === "guest_checked_out") return "After guest checkout";
    if (t.event === "review_period_ended") return "After review period";
    return t.event || "Event-driven";
  }
  if (t.type === "time_relative") {
    const offset = t.offset_hours ?? 0;
    const rel =
      t.relative_to === "checkin_date"
        ? "check-in"
        : t.relative_to === "checkout_date"
        ? "checkout"
        : "event";
    if (offset === 0) return `Morning of ${rel}`;
    if (offset < 0) return `${Math.abs(offset)}h before ${rel}`;
    return `${offset}h after ${rel}`;
  }
  return "—";
}
