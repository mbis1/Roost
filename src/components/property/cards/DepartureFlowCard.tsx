"use client";

import { useEffect, useState } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { FormField } from "@/components/ui";
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
  /** Sprint F — selected vendor id (replaces free-text cleaner_contact). */
  cleaner_vendor_id: string;
  /** Sprint F — lead time in hours (replaces the old "24"|"48"|"72" string). */
  cleaner_lead_time_hours: number;
  cleaner_message_template: string;
  // Legacy fields preserved on read for back-compat; not edited via the form.
  cleaner_contact?: string;
  cleaner_lead_time?: string;
};

const DEFAULT_CHECKOUT_INSTRUCTIONS =
  `Before you leave, please:\n` +
  `- Take out trash to the bin outside\n` +
  `- Turn off all lights and the AC\n` +
  `- Lock the door`;

const DEFAULT_CHECKOUT_REMINDER =
  `Hi {{guest_name}}, just a friendly reminder — checkout is by {{checkout_time}} today. ` +
  `{{checkout_instructions}}`;

const DEFAULT_CLEANER_MESSAGE =
  `Hi {{cleaner_name}}, heads up: checkout at {{property_nickname}} on {{checkout_date}} at {{checkout_time}}. ` +
  `Next check-in {{next_checkin_date}}. Let me know if any questions!`;

const DEFAULT: DepartureData = {
  checkout_time: "11:00",
  checkout_instructions: DEFAULT_CHECKOUT_INSTRUCTIONS,
  checkout_reminder_enabled: true,
  checkout_reminder_template: DEFAULT_CHECKOUT_REMINDER,
  cleaner_notify_enabled: true,
  cleaner_vendor_id: "",
  cleaner_lead_time_hours: 24 * 28, // 4 weeks default per Sprint F
  cleaner_message_template: DEFAULT_CLEANER_MESSAGE,
};

const LEAD_TIME_OPTIONS = [
  { value: "24", label: "24 hours before checkout" },
  { value: "48", label: "48 hours before checkout" },
  { value: "72", label: "3 days before checkout" },
  { value: "168", label: "1 week before checkout" },
  { value: "336", label: "2 weeks before checkout" },
  { value: "672", label: "4 weeks before checkout" },
];

function leadTimeShort(hours: number): string {
  if (hours <= 72) return `${hours}h before`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d before`;
  const weeks = Math.round(days / 7);
  return `${weeks}w before`;
}

function snippet(s: string, n = 100): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > n ? trimmed.slice(0, n) + "…" : trimmed;
}

function hasDataFor(raw: Record<string, unknown> | undefined): boolean {
  return !!raw && Object.keys(raw).length > 0;
}

/** Migrate older saved shapes into the Sprint F shape. */
function normalize(raw: Record<string, unknown> | undefined): DepartureData {
  const data = (raw || {}) as Partial<DepartureData> & Record<string, unknown>;
  const leadHours = (() => {
    if (typeof data.cleaner_lead_time_hours === "number")
      return data.cleaner_lead_time_hours;
    if (typeof data.cleaner_lead_time === "string") {
      const n = parseInt(data.cleaner_lead_time, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return DEFAULT.cleaner_lead_time_hours;
  })();
  return {
    ...DEFAULT,
    ...data,
    cleaner_lead_time_hours: leadHours,
    cleaner_vendor_id:
      (data.cleaner_vendor_id as string) ||
      // If only legacy text contact exists, leave vendor_id empty —
      // user will pick from the dropdown.
      "",
  };
}

/* ------------------ Vendor dropdown hook ------------------ */

type CleanerOption = { value: string; label: string; phone?: string | null };

function useCleanerOptions(propertyId: string | null | undefined): {
  loading: boolean;
  options: CleanerOption[];
  refetch: () => Promise<void>;
} {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<CleanerOption[]>([]);

  const refetch = async () => {
    if (!propertyId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/vendors?property_id=${encodeURIComponent(propertyId)}&role=cleaner`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (r.ok && Array.isArray(j.vendors)) {
        setOptions(
          j.vendors.map((v: { id: string; name: string; phone: string | null }) => ({
            value: v.id,
            label: v.name,
            phone: v.phone,
          }))
        );
      } else {
        setOptions([]);
      }
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  return { loading, options, refetch };
}

/* ------------------ Component ------------------ */

export function DepartureFlowCard({
  data,
  onSave,
  propertyId,
}: {
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
  /** Sprint F — needed to load this property's cleaners. */
  propertyId?: string;
}) {
  const saved = normalize(data);
  const hasData = hasDataFor(data);

  const { form, setField, editing, saving, startEdit, save, cancel } =
    useEditable<DepartureData>(saved, async (f) => {
      await onSave("departure_flow", f as unknown as Record<string, unknown>);
    });

  const { options: cleaners, loading: loadingCleaners } = useCleanerOptions(
    propertyId
  );

  const selectedCleaner =
    cleaners.find((c) => c.value === form.cleaner_vendor_id) || null;

  const filled = [
    form.checkout_time,
    form.checkout_instructions,
    form.checkout_reminder_enabled ? "y" : "",
    form.cleaner_notify_enabled ? "y" : "",
    form.cleaner_vendor_id || saved.cleaner_contact || "",
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
            label="Cleaner"
            value={
              selectedCleaner
                ? selectedCleaner.label
                : saved.cleaner_contact || "— not set —"
            }
            muted={!selectedCleaner && !saved.cleaner_contact}
          />
          <ReadRow
            label="Lead time"
            value={leadTimeShort(form.cleaner_lead_time_hours)}
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
  const cleanerSelectOptions = [
    { value: "", label: "— not set —" },
    ...cleaners.map((c) => ({ value: c.value, label: c.label })),
  ];

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
          <FormField label="Cleaner">
            <KVSelect
              value={form.cleaner_vendor_id}
              onChange={(v) => setField("cleaner_vendor_id", v)}
              options={cleanerSelectOptions}
            />
            {!loadingCleaners && cleaners.length === 0 && (
              <p className="text-[11px] text-txt-tertiary mt-1.5 leading-relaxed">
                No cleaner vendor yet for this property.{" "}
                <a
                  href={
                    propertyId
                      ? `/property/${propertyId}?tab=vendors`
                      : "#"
                  }
                  className="text-brand font-semibold hover:underline"
                >
                  Add a cleaner in the Vendors tab →
                </a>
              </p>
            )}
            {loadingCleaners && (
              <p className="text-[11px] text-txt-tertiary mt-1.5">
                Loading cleaners…
              </p>
            )}
          </FormField>

          <FormField label="Lead Time">
            <KVSelect
              value={String(form.cleaner_lead_time_hours)}
              onChange={(v) =>
                setField(
                  "cleaner_lead_time_hours",
                  parseInt(v, 10) || DEFAULT.cleaner_lead_time_hours
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
            `Notify cleaner ${leadTimeShort(form.cleaner_lead_time_hours)} checkout`,
          ]}
          note={
            selectedCleaner
              ? `To: ${selectedCleaner.label}`
              : "No cleaner selected — vendor will skip this step"
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
  const merged = normalize(data);
  const parts = [`Check-out ${formatTime12(merged.checkout_time)}`];
  if (merged.cleaner_notify_enabled) {
    parts.push(
      `Cleaner notified ${leadTimeShort(merged.cleaner_lead_time_hours)}`
    );
  } else {
    parts.push("Cleaner OFF");
  }
  return parts.join(" · ");
}
