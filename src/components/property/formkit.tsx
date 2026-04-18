"use client";

import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  useCallback,
  TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";
import { Button, Label } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* useEditable — Edit-before-change state manager                      */
/* ------------------------------------------------------------------ */

export function useEditable<T>(
  initial: T,
  onSave: (form: T) => Promise<void>
) {
  const [form, setForm] = useState<T>(initial);
  const [snapshot, setSnapshot] = useState<T>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // If parent reloads saved data and we're not mid-edit, sync.
  useEffect(() => {
    if (!editing) {
      setForm(initial);
      setSnapshot(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial), editing]);

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setForm((prev) => ({ ...(prev as object), [key]: value } as T));
    },
    []
  );

  const startEdit = useCallback(() => {
    setSnapshot(form);
    setEditing(true);
  }, [form]);

  const cancel = useCallback(() => {
    setForm(snapshot);
    setEditing(false);
  }, [snapshot]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(form);
      setSnapshot(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [form, onSave]);

  return { form, setField, setForm, editing, saving, startEdit, save, cancel };
}

/* ------------------------------------------------------------------ */
/* EditableSection — wraps read/edit toggle with Edit / Save / Cancel  */
/* ------------------------------------------------------------------ */

export function EditableSection({
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
  readView,
  editView,
  hasData,
}: {
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  readView: ReactNode;
  editView: ReactNode;
  hasData: boolean;
}) {
  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-muted bg-white/60 p-4">
          {hasData ? (
            readView
          ) : (
            <p className="text-xs text-txt-tertiary italic">
              Not configured yet. Click Edit to set this card up.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={onEdit} variant="ghost">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="edit" className="text-sm" />
              Edit
            </span>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {editView}
      <div className="flex gap-2 justify-end pt-2 border-t border-surface-muted">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only row — label + value                                       */
/* ------------------------------------------------------------------ */

export function ReadRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary w-36 flex-shrink-0">
        {label}
      </span>
      <span
        className={clsx(
          "text-sm text-right flex-1 break-words",
          muted ? "text-txt-tertiary italic" : "text-txt"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none py-1">
      <span
        className={clsx(
          "relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5",
          checked ? "bg-brand" : "bg-surface-muted"
        )}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
      <span className="flex-1">
        <span className="text-sm font-semibold text-txt block">{label}</span>
        {description && (
          <span className="text-xs text-txt-tertiary block mt-0.5">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* RadioGroup                                                          */
/* ------------------------------------------------------------------ */

export type RadioOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledNote?: string;
};

export function RadioGroup({
  value,
  onChange,
  options,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  options: RadioOption[];
  name: string;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={clsx(
            "flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer",
            value === opt.value
              ? "border-brand bg-brand/5"
              : "border-surface-muted bg-white/60",
            opt.disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            disabled={opt.disabled}
            onChange={() => !opt.disabled && onChange(opt.value)}
            className="mt-0.5 accent-brand cursor-pointer"
          />
          <span className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-txt block">
              {opt.label}
            </span>
            {(opt.description || opt.disabledNote) && (
              <span className="text-xs text-txt-tertiary block mt-0.5">
                {opt.disabled ? opt.disabledNote : opt.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Key/Value Select                                                    */
/* ------------------------------------------------------------------ */

export type KVOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function KVSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: KVOption[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* TimeInput — 24h native, display helpers below                       */
/* ------------------------------------------------------------------ */

export function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand"
    />
  );
}

export function formatTime12(hhmm: string): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || "—";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/* ------------------------------------------------------------------ */
/* Reset-to-default link                                               */
/* ------------------------------------------------------------------ */

export function ResetLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold text-brand hover:underline cursor-pointer inline-flex items-center gap-1"
    >
      <Icon name="refresh" className="text-xs" />
      Reset to default
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Variable chips — clickable pills that insert {{var}} at cursor      */
/* ------------------------------------------------------------------ */

export type TemplateVariable = {
  key: string;
  label: string;
};

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "guest_name", label: "guest name" },
  { key: "guest_phone_last_4", label: "guest phone last 4" },
  { key: "checkin_date", label: "checkin date" },
  { key: "checkout_date", label: "checkout date" },
  { key: "checkin_time", label: "checkin time" },
  { key: "checkout_time", label: "checkout time" },
  { key: "nights_count", label: "nights count" },
  { key: "property_name", label: "property name" },
  { key: "property_nickname", label: "property nickname" },
  { key: "property_address", label: "property address" },
  { key: "wifi_network", label: "wifi network" },
  { key: "wifi_password", label: "wifi password" },
  { key: "lock_code", label: "lock code" },
  { key: "cleaner_name", label: "cleaner name" },
  { key: "host_name", label: "host name" },
  { key: "next_checkin_date", label: "next checkin date" },
];

export function VariableChips({
  onInsert,
  variables = TEMPLATE_VARIABLES,
}: {
  onInsert: (token: string) => void;
  variables?: TemplateVariable[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {variables.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(`{{${v.key}}}`)}
          title={`Insert {{${v.key}}}`}
          className="text-[11px] px-2 py-0.5 rounded-full bg-surface-soft border border-surface-muted text-txt-secondary hover:bg-brand/10 hover:border-brand hover:text-brand cursor-pointer transition-colors"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TemplateTextArea — textarea + variable chips + reset-to-default     */
/* ------------------------------------------------------------------ */

export function TemplateTextArea({
  value,
  onChange,
  defaultValue,
  rows = 7,
  placeholder,
  label,
  showChips = true,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultValue: string;
  rows?: number;
  placeholder?: string;
  label?: string;
  showChips?: boolean;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (token: string) => {
    if (readOnly) return;
    const ta = ref.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const taProps: TextareaHTMLAttributes<HTMLTextAreaElement> = {
    value,
    onChange: (e) => onChange(e.target.value),
    rows,
    placeholder,
    readOnly,
    className:
      "w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand resize-y font-mono leading-relaxed",
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      {showChips && !readOnly && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-txt-tertiary mb-1">
            Insert variable
          </p>
          <VariableChips onInsert={insertAtCursor} />
        </div>
      )}
      <textarea ref={ref} {...taProps} />
      {!readOnly && (
        <div className="flex justify-end">
          <ResetLink onClick={() => onChange(defaultValue)} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* WorkflowPreview — styled container for hardcoded preview steps      */
/* ------------------------------------------------------------------ */

export function WorkflowPreview({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 pt-4 border-t border-surface-muted">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="conversion_path" className="text-base text-brand" />
        <h4 className="text-sm font-extrabold text-txt">Workflow Preview</h4>
        <span className="text-[9px] font-bold text-txt-tertiary bg-surface-soft px-1.5 py-0.5 rounded uppercase tracking-wide">
          auto-generated
        </span>
      </div>
      <p className="text-[11px] text-txt-tertiary mb-3">
        These workflow steps would be generated from the settings above. The
        compiler that runs them isn&apos;t wired up yet — this is a preview.
      </p>
      <div className="rounded-xl border border-surface-muted bg-surface-soft/40 p-3 space-y-3 text-[13px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export function PreviewBlock({
  title,
  steps,
  execution,
  note,
}: {
  title: string;
  steps: string[];
  execution?: string;
  note?: string;
}) {
  return (
    <div>
      <p className="font-bold text-txt">{title}</p>
      <ul className="mt-1 space-y-0.5 ml-1">
        {steps.map((s, i) => (
          <li key={i} className="text-txt-secondary">
            <span className="text-brand mr-1">→</span>
            {s}
          </li>
        ))}
      </ul>
      {execution && (
        <p className="mt-1 text-[11px] text-txt-tertiary">
          Execution: <span className="font-semibold">{execution}</span>
        </p>
      )}
      {note && (
        <p className="mt-1 text-[11px] text-txt-tertiary italic">{note}</p>
      )}
    </div>
  );
}
