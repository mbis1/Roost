"use client";

import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { Input, FormField } from "@/components/ui";
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

type DepartureData = {
  checkout_time: string; // "HH:MM"
  checkout_instructions: string;
  checkout_reminder_enabled: boolean;
  checkout_reminder_template: string;
  cleaner_notify_enabled: boolean;
  cleaner_contact: string;
  cleaner_lead_time: "24" | "48" | "72";
  cleaner_message_template: string;
};

const DEFAULT_CHECKOUT_INSTRUCTIONS =
  `Before you leave, please:\n` +
  `- Take out trash to the bin outside\n` +
  `- Turn off all lights and the AC\n` +
  `- Lock the door`;

const DEFAULT_CHECKOUT_REMINDER =
  `Hi {{guest_name}}, just a friendly reminder — checkout is by {{checkout_time}} today. ` +
  `{{checkout_instructions_short}}`;

const DEFAULT_CLEANER_MESSAGE =
  `Hi {{cleaner_name}}, heads up: checkout at {{property_nickname}} on {{checkout_date}} at {{checkout_time}}. ` +
  `Next check-in {{next_checkin_date}}. Let me know if any questions!`;

const DEFAULT: DepartureData = {
  checkout_time: "11:00",
  checkout_instructions: DEFAULT_CHECKOUT_INSTRUCTIONS,
  checkout_reminder_enabled: true,
  checkout_reminder_template: DEFAULT_CHECKOUT_REMINDER,
  cleaner_notify_enabled: true,
  cleaner_contact: "",
  cleaner_lead_time: "48",
  cleaner_message_template: DEFAULT_CLEANER_MESSAGE,
};

const LEAD_TIME_OPTIONS = [
  { value: "24", label: "24 hours before checkout" },
  { value: "48", label: "48 hours before checkout" },
  { value: "72", label: "72 hours before checkout" },
];

function leadTimeShort(v: string): string {
  return `${v}h before`;
}

function snippet(s: string, n = 100): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > n ? trimmed.slice(0, n) + "…" : trimmed;
}

function hasDataFor(raw: Record<string, unknown> | undefined): boolean {
  return !!raw && Object.keys(raw).length > 0;
}

/* ------------------ Component ------------------ */

export function DepartureFlowCard({
  data,
  onSave,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const saved: DepartureData = {
    ...DEFAULT,
    ...((data as DepartureData) || {}),
  };
  const hasData = hasDataFor(data);

  const { form, setField, editing, saving, startEdit, save, cancel } =
    useEditable<DepartureData>(saved, async (f) => {
      await onSave("departure_flow", f as unknown as Record<string, unknown>);
    });

  const filled = [
    form.checkout_time,
    form.checkout_instructions,
    form.checkout_reminder_enabled ? "y" : "",
    form.cleaner_notify_enabled ? "y" : "",
    form.cleaner_contact,
  ].filter(Boolean).length;
  const status = cardStatus(hasData ? filled : 0, 5);

  /* --------- Read view --------- */
  const readView = (
    <div className="divide-y divide-surface-muted">
      <ReadRow
        label="Check-out time"
        value={formatTime12(form.checkout_time)}
      />
      <ReadRow
        label="Instructions"
        value={
          <span className="font-mono text-xs text-txt-secondary block text-left whitespace-pre-wrap">
            {snippet(form.checkout_instructions, 200)}
          </span>
        }
      />
      <ReadRow
        label="Checkout reminder"
        value={form.checkout_reminder_enabled ? "On" : "Off"}
      />
      {form.checkout_reminder_enabled && (
        <ReadRow
          label="Reminder template"
          value={
            <span className="font-mono text-xs text-txt-secondary block text-left whitespace-pre-wrap">
              {snippet(form.checkout_reminder_template, 180)}
            </span>
          }
        />
      )}
      <ReadRow
        label="Cleaner notify"
        value={form.cleaner_notify_enabled ? "On" : "Off"}
      />
      {form.cleaner_notify_enabled && (
        <>
          <ReadRow
            label="Cleaner contact"
            value={form.cleaner_contact || "—"}
            muted={!form.cleaner_contact}
          />
          <ReadRow
            label="Lead time"
            value={leadTimeShort(form.cleaner_lead_time)}
          />
          <ReadRow
            label="Cleaner message"
            value={
              <span className="font-mono text-xs text-txt-secondary block text-left whitespace-pre-wrap">
                {snippet(form.cleaner_message_template, 180)}
              </span>
            }
          />
        </>
      )}
    </div>
  );

  /* --------- Edit view --------- */
  const editView = (
    <div className="space-y-4">
      <FormField label="Check-out Time">
        <TimeInput
          value={form.checkout_time}
          onChange={(v) => setField("checkout_time", v)}
        />
      </FormField>

      <TemplateTextArea
        label="Checkout Instructions (shown in guest reminders)"
        value={form.checkout_instructions}
        onChange={(v) => setField("checkout_instructions", v)}
        defaultValue={DEFAULT_CHECKOUT_INSTRUCTIONS}
        rows={5}
        showChips={false}
      />

      <div>
        <Toggle
          checked={form.checkout_reminder_enabled}
          onChange={(v) => setField("checkout_reminder_enabled", v)}
          label="Send reminder morning of checkout"
        />
      </div>

      {form.checkout_reminder_enabled && (
        <TemplateTextArea
          label="Checkout Reminder Template"
          value={form.checkout_reminder_template}
          onChange={(v) => setField("checkout_reminder_template", v)}
          defaultValue={DEFAULT_CHECKOUT_REMINDER}
          rows={4}
        />
      )}

      <div className="pt-2 border-t border-surface-muted" />

      <div>
        <Toggle
          checked={form.cleaner_notify_enabled}
          onChange={(v) => setField("cleaner_notify_enabled", v)}
          label="Notify cleaner when booking is confirmed"
        />
      </div>

      {form.cleaner_notify_enabled && (
        <>
          <FormField label="Cleaner Contact">
            <Input
              value={form.cleaner_contact}
              onChange={(v) => setField("cleaner_contact", v)}
              placeholder="Maria 555-1234"
            />
          </FormField>

          <FormField label="Lead Time">
            <KVSelect
              value={form.cleaner_lead_time}
              onChange={(v) =>
                setField(
                  "cleaner_lead_time",
                  v as DepartureData["cleaner_lead_time"]
                )
              }
              options={LEAD_TIME_OPTIONS}
            />
          </FormField>

          <TemplateTextArea
            label="Cleaner Message Template"
            value={form.cleaner_message_template}
            onChange={(v) => setField("cleaner_message_template", v)}
            defaultValue={DEFAULT_CLEANER_MESSAGE}
            rows={5}
          />
        </>
      )}
    </div>
  );

  /* --------- Preview --------- */
  const preview = (
    <WorkflowPreview>
      {form.cleaner_notify_enabled && (
        <PreviewBlock
          title="When booking confirmed"
          steps={[
            `Notify cleaner ${leadTimeShort(form.cleaner_lead_time)} checkout`,
          ]}
          note={
            form.cleaner_contact
              ? `To: ${form.cleaner_contact}`
              : "Cleaner contact not set"
          }
        />
      )}
      {form.checkout_reminder_enabled && (
        <PreviewBlock
          title="Morning of checkout"
          steps={["Send checkout reminder to guest"]}
          note={`Template preview: ${snippet(
            form.checkout_reminder_template,
            100
          )}`}
        />
      )}
      <PreviewBlock
        title="After checkout"
        steps={["Confirm cleaner completed turnover  (placeholder)"]}
      />
      {!form.cleaner_notify_enabled && !form.checkout_reminder_enabled && (
        <p className="text-xs text-txt-tertiary italic">
          Both automation toggles are off — only the turnover confirmation
          placeholder is scheduled.
        </p>
      )}
    </WorkflowPreview>
  );

  return (
    <PropertyCard
      icon="logout"
      title="Departure Flow"
      summary={
        hasData
          ? departureFlowSummary(saved as unknown as Record<string, unknown>)
          : undefined
      }
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
export function departureFlowSummary(
  data: Record<string, unknown> | undefined
): string | undefined {
  if (!hasDataFor(data)) return undefined;
  const merged: DepartureData = { ...DEFAULT, ...(data as DepartureData) };
  const parts = [`Check-out ${formatTime12(merged.checkout_time)}`];
  if (merged.cleaner_notify_enabled) {
    parts.push(`Cleaner notified ${leadTimeShort(merged.cleaner_lead_time)}`);
  } else {
    parts.push("Cleaner OFF");
  }
  return parts.join(" · ");
}
