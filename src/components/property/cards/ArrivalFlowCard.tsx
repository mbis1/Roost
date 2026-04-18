"use client";

import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { TextArea, FormField } from "@/components/ui";
import {
  EditableSection,
  KVSelect,
  ReadRow,
  TimeInput,
  Toggle,
  TemplateTextArea,
  formatTime12,
  useEditable,
  WorkflowPreview,
  PreviewBlock,
} from "@/components/property/formkit";

/* ------------------ Types & constants ------------------ */

type ArrivalData = {
  checkin_time: string; // "HH:MM"
  checkin_window_end: "flexible" | "18:00" | "20:00" | "22:00";
  welcome_enabled: boolean;
  welcome_template: string;
  pre_arrival_enabled: boolean;
  pre_arrival_template: string;
  parking_instructions: string;
};

const DEFAULT_WELCOME =
  `Hi {{guest_name}}, welcome!\n\n` +
  `You're all set for your stay at {{property_nickname}} from {{checkin_date}} to {{checkout_date}}.\n\n` +
  `Check-in is after {{checkin_time}}. Your door code will be {{lock_code}}.\n\n` +
  `WiFi: {{wifi_network}} / {{wifi_password}}\n\n` +
  `Looking forward to hosting you!`;

const DEFAULT_PRE_ARRIVAL =
  `Hi {{guest_name}}, just a reminder: check-in tomorrow at {{checkin_time}}. ` +
  `Your door code is {{lock_code}}. See you soon!`;

const DEFAULT: ArrivalData = {
  checkin_time: "16:00",
  checkin_window_end: "flexible",
  welcome_enabled: true,
  welcome_template: DEFAULT_WELCOME,
  pre_arrival_enabled: false,
  pre_arrival_template: DEFAULT_PRE_ARRIVAL,
  parking_instructions: "",
};

const WINDOW_END_OPTIONS = [
  { value: "flexible", label: "Flexible (no end time)" },
  { value: "18:00", label: "6:00 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "22:00", label: "10:00 PM" },
];

function windowEndLabel(v: string): string {
  return WINDOW_END_OPTIONS.find((o) => o.value === v)?.label || v;
}

function snippet(s: string, n = 100): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > n ? trimmed.slice(0, n) + "…" : trimmed;
}

function hasDataFor(raw: Record<string, unknown> | undefined): boolean {
  return !!raw && Object.keys(raw).length > 0;
}

/* ------------------ Component ------------------ */

export function ArrivalFlowCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const saved: ArrivalData = { ...DEFAULT, ...((data as ArrivalData) || {}) };
  const hasData = hasDataFor(data);

  const { form, setField, editing, saving, startEdit, save, cancel } =
    useEditable<ArrivalData>(saved, async (f) => {
      await onSave("arrival_flow", f as unknown as Record<string, unknown>);
    });

  const filled = [
    form.checkin_time,
    form.checkin_window_end,
    form.welcome_enabled ? "y" : "",
    form.parking_instructions,
  ].filter(Boolean).length;
  const status = cardStatus(hasData ? filled : 0, 4);

  /* --------- Read view --------- */
  const readView = (
    <div className="divide-y divide-surface-muted">
      <ReadRow label="Check-in time" value={formatTime12(form.checkin_time)} />
      <ReadRow
        label="Window end"
        value={windowEndLabel(form.checkin_window_end)}
      />
      <ReadRow
        label="Welcome message"
        value={form.welcome_enabled ? "On" : "Off"}
      />
      {form.welcome_enabled && (
        <ReadRow
          label="Welcome template"
          value={
            <span className="font-mono text-xs text-txt-secondary block text-left whitespace-pre-wrap">
              {snippet(form.welcome_template, 180)}
            </span>
          }
        />
      )}
      <ReadRow
        label="Pre-arrival reminder"
        value={form.pre_arrival_enabled ? "On (24h before)" : "Off"}
      />
      {form.pre_arrival_enabled && (
        <ReadRow
          label="Reminder template"
          value={
            <span className="font-mono text-xs text-txt-secondary block text-left whitespace-pre-wrap">
              {snippet(form.pre_arrival_template, 180)}
            </span>
          }
        />
      )}
      <ReadRow
        label="Parking"
        value={form.parking_instructions || "—"}
        muted={!form.parking_instructions}
      />
    </div>
  );

  /* --------- Edit view --------- */
  const editView = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Check-in Time">
          <TimeInput
            value={form.checkin_time}
            onChange={(v) => setField("checkin_time", v)}
          />
        </FormField>
        <FormField label="Check-in Window End">
          <KVSelect
            value={form.checkin_window_end}
            onChange={(v) =>
              setField(
                "checkin_window_end",
                v as ArrivalData["checkin_window_end"]
              )
            }
            options={WINDOW_END_OPTIONS}
          />
        </FormField>
      </div>

      <div>
        <Toggle
          checked={form.welcome_enabled}
          onChange={(v) => setField("welcome_enabled", v)}
          label="Send welcome message when booking is accepted"
        />
      </div>

      {form.welcome_enabled && (
        <TemplateTextArea
          label="Welcome Message Template"
          value={form.welcome_template}
          onChange={(v) => setField("welcome_template", v)}
          defaultValue={DEFAULT_WELCOME}
          rows={9}
        />
      )}

      <div>
        <Toggle
          checked={form.pre_arrival_enabled}
          onChange={(v) => setField("pre_arrival_enabled", v)}
          label="Send reminder 24h before check-in"
        />
      </div>

      {form.pre_arrival_enabled && (
        <TemplateTextArea
          label="Pre-arrival Reminder Template"
          value={form.pre_arrival_template}
          onChange={(v) => setField("pre_arrival_template", v)}
          defaultValue={DEFAULT_PRE_ARRIVAL}
          rows={5}
        />
      )}

      <FormField label="Parking Instructions (optional)">
        <TextArea
          value={form.parking_instructions}
          onChange={(v) => setField("parking_instructions", v)}
          rows={3}
          placeholder="Street parking on Elm St, free after 6pm. Driveway fits 2 cars."
        />
      </FormField>
    </div>
  );

  /* --------- Preview --------- */
  const preview = (
    <WorkflowPreview>
      {form.welcome_enabled && (
        <PreviewBlock
          title="When booking accepted"
          steps={[
            "Draft welcome message",
            "Send to Telegram for approval",
          ]}
          note={`Template preview: ${snippet(form.welcome_template, 100)}`}
        />
      )}
      {form.pre_arrival_enabled && (
        <PreviewBlock
          title="24h before check-in"
          steps={[
            "Draft reminder message",
            "Send to Telegram for approval",
          ]}
          note={`Template preview: ${snippet(form.pre_arrival_template, 100)}`}
        />
      )}
      {!form.welcome_enabled && !form.pre_arrival_enabled && (
        <p className="text-xs text-txt-tertiary italic">
          No automated guest messages — both toggles are off.
        </p>
      )}
    </WorkflowPreview>
  );

  return (
    <PropertyCard
      icon="login"
      title="Arrival Flow"
      summary={hasData ? arrivalFlowSummary(saved as unknown as Record<string, unknown>) : undefined}
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

/* Exported for hub-grid collapsed summary */
export function arrivalFlowSummary(
  data: Record<string, unknown> | undefined
): string | undefined {
  if (!hasDataFor(data)) return undefined;
  const merged: ArrivalData = { ...DEFAULT, ...(data as ArrivalData) };
  const parts = [
    `Check-in ${formatTime12(merged.checkin_time)}`,
    `Welcome message ${merged.welcome_enabled ? "ON" : "OFF"}`,
  ];
  if (merged.pre_arrival_enabled) parts.push("24h reminder ON");
  return parts.join(" · ");
}
