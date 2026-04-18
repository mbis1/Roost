"use client";

import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, FormField } from "@/components/ui";
import {
  EditableSection,
  KVSelect,
  RadioGroup,
  ReadRow,
  useEditable,
  WorkflowPreview,
  PreviewBlock,
} from "@/components/property/formkit";

/* ------------------ Types & constants ------------------ */

type AccessData = {
  lock_type: "yale_smart_lock" | "other";
  code_method: "phone_last_4" | "custom_static";
  custom_code: string;
  code_lifecycle: "reset_per_booking" | "never_reset";
  execution_mode: "semi_auto" | "manual" | "fully_auto";
  spare_key_location: string;
};

const DEFAULT: AccessData = {
  lock_type: "yale_smart_lock",
  code_method: "phone_last_4",
  custom_code: "",
  code_lifecycle: "reset_per_booking",
  execution_mode: "semi_auto",
  spare_key_location: "",
};

const LOCK_TYPE_OPTIONS = [
  { value: "yale_smart_lock", label: "Yale smart lock" },
  { value: "other", label: "Other (coming soon)", disabled: true },
];

const CODE_METHOD_OPTIONS = [
  { value: "phone_last_4", label: "Last 4 digits of guest's phone number" },
  { value: "custom_static", label: "Custom static code" },
];

const CODE_LIFECYCLE_OPTIONS = [
  { value: "reset_per_booking", label: "Reset on every new booking" },
  { value: "never_reset", label: "Never reset (manual only)" },
];

const EXECUTION_OPTIONS = [
  {
    value: "semi_auto",
    label: "Semi-automated: Telegram ping with instructions",
    description: "Roost drafts the code change; you approve in Telegram.",
  },
  {
    value: "manual",
    label: "Manual: just remind me",
    description: "Roost only sends a reminder. You handle the code change.",
  },
  {
    value: "fully_auto",
    label: "Fully automated",
    disabled: true,
    disabledNote: "Requires Yale API integration — coming soon.",
  },
];

/* ------------------ Label helpers ------------------ */

function labelFor(
  list: { value: string; label: string }[],
  v: string
): string {
  return list.find((x) => x.value === v)?.label || v;
}

function shortExecutionLabel(v: string): string {
  if (v === "semi_auto") return "Telegram ping";
  if (v === "manual") return "Reminder only";
  if (v === "fully_auto") return "Fully automated";
  return v;
}

function codeSourceLabel(form: AccessData): string {
  if (form.code_method === "phone_last_4") {
    return "last 4 digits of {{guest_phone_last_4}}";
  }
  return form.custom_code
    ? `static code "${form.custom_code}"`
    : "custom static code (not set)";
}

function summaryFor(form: AccessData): string | undefined {
  if (form.lock_type === "yale_smart_lock") {
    const codeBit =
      form.code_method === "phone_last_4"
        ? "phone last-4"
        : form.custom_code
        ? `code ${form.custom_code}`
        : "custom code (unset)";
    const lifeBit =
      form.code_lifecycle === "reset_per_booking"
        ? "reset per booking"
        : "no reset";
    return `Yale · ${codeBit} · ${lifeBit}`;
  }
  return undefined;
}

function hasDataFor(raw: Record<string, unknown> | undefined): boolean {
  return !!raw && Object.keys(raw).length > 0;
}

/* ------------------ Component ------------------ */

export function AccessLocksCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const saved: AccessData = { ...DEFAULT, ...((data as AccessData) || {}) };
  const hasData = hasDataFor(data);

  const { form, setField, editing, saving, startEdit, save, cancel } =
    useEditable<AccessData>(saved, async (f) => {
      await onSave("access_and_locks", f as unknown as Record<string, unknown>);
    });

  const filled = [
    form.lock_type,
    form.code_method,
    form.code_lifecycle,
    form.execution_mode,
    form.spare_key_location,
  ].filter((x) => x && String(x).trim()).length;
  const status = cardStatus(hasData ? filled : 0, 5);

  /* --------- Read view --------- */
  const readView = (
    <div className="divide-y divide-surface-muted">
      <ReadRow label="Lock type" value={labelFor(LOCK_TYPE_OPTIONS, form.lock_type)} />
      <ReadRow
        label="Code method"
        value={labelFor(CODE_METHOD_OPTIONS, form.code_method)}
      />
      {form.code_method === "custom_static" && (
        <ReadRow
          label="Code"
          value={form.custom_code || "—"}
          muted={!form.custom_code}
        />
      )}
      <ReadRow
        label="Lifecycle"
        value={labelFor(CODE_LIFECYCLE_OPTIONS, form.code_lifecycle)}
      />
      <ReadRow
        label="Execution"
        value={labelFor(EXECUTION_OPTIONS, form.execution_mode)}
      />
      <ReadRow
        label="Spare key"
        value={form.spare_key_location || "—"}
        muted={!form.spare_key_location}
      />
    </div>
  );

  /* --------- Edit view --------- */
  const editView = (
    <div className="space-y-4">
      <FormField label="Lock Type">
        <KVSelect
          value={form.lock_type}
          onChange={(v) => setField("lock_type", v as AccessData["lock_type"])}
          options={LOCK_TYPE_OPTIONS}
        />
      </FormField>

      <FormField label="Code Generation Method">
        <KVSelect
          value={form.code_method}
          onChange={(v) =>
            setField("code_method", v as AccessData["code_method"])
          }
          options={CODE_METHOD_OPTIONS}
        />
      </FormField>

      {form.code_method === "custom_static" && (
        <FormField label="Custom Code">
          <Input
            value={form.custom_code}
            onChange={(v) => setField("custom_code", v)}
            placeholder="4-6 digits"
          />
        </FormField>
      )}

      <FormField label="Code Lifecycle">
        <KVSelect
          value={form.code_lifecycle}
          onChange={(v) =>
            setField("code_lifecycle", v as AccessData["code_lifecycle"])
          }
          options={CODE_LIFECYCLE_OPTIONS}
        />
      </FormField>

      <FormField label="Execution Mode">
        <RadioGroup
          name="execution_mode"
          value={form.execution_mode}
          onChange={(v) =>
            setField("execution_mode", v as AccessData["execution_mode"])
          }
          options={EXECUTION_OPTIONS}
        />
      </FormField>

      <FormField label="Spare Key Location (optional)">
        <Input
          value={form.spare_key_location}
          onChange={(v) => setField("spare_key_location", v)}
          placeholder="e.g. Lockbox under deck, code 0420"
        />
      </FormField>
    </div>
  );

  /* --------- Preview --------- */
  const preview = (
    <WorkflowPreview>
      <PreviewBlock
        title="Before guest arrival"
        steps={[
          form.code_lifecycle === "reset_per_booking"
            ? "Remove previous guest's code"
            : "Leave existing codes in place",
          `Compute new code: ${codeSourceLabel(form)}`,
          "Add new code to Yale lock",
        ]}
        execution={shortExecutionLabel(form.execution_mode)}
      />
      <PreviewBlock
        title="After guest checkout"
        steps={
          form.code_lifecycle === "reset_per_booking"
            ? ["Remove {{guest_phone_last_4}} code from Yale lock"]
            : ["(no change — codes are never reset)"]
        }
        execution={
          form.code_lifecycle === "reset_per_booking"
            ? shortExecutionLabel(form.execution_mode)
            : undefined
        }
      />
    </WorkflowPreview>
  );

  return (
    <PropertyCard
      icon="lock"
      title="Access & Locks"
      summary={hasData ? summaryFor(form) : undefined}
      status={status}
      full
    >
      {() => (
        <div>
          <EditableSection
            editing={editing}
            saving={saving}
            onEdit={startEdit}
            onSave={save}
            onCancel={cancel}
            readView={readView}
            editView={editView}
            hasData={hasData}
          />
          {preview}
        </div>
      )}
    </PropertyCard>
  );
}

/* Exported for PropertyHub collapsed-summary wiring */
export function accessLocksSummary(
  data: Record<string, unknown> | undefined
): string | undefined {
  if (!hasDataFor(data)) return undefined;
  const merged: AccessData = { ...DEFAULT, ...(data as AccessData) };
  return summaryFor(merged);
}
