"use client";

import { useState, useEffect } from "react";
import { PropertyCard, cardStatus } from "@/components/property/PropertyCard";
import { TextArea, Button, Label } from "@/components/ui";

/**
 * Generic skeleton card backed by a single `notes` jsonb field. Used for
 * cards whose full form isn't built yet. User can start dumping notes now,
 * structured fields come later.
 */
export function NotesCard({
  icon,
  title,
  section,
  placeholder,
  data,
  onSave,
}: {
  icon: string;
  title: string;
  section: string;
  placeholder?: string;
  data: Record<string, unknown> | undefined;
  onSave: (section: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const initial = typeof data?.notes === "string" ? (data.notes as string) : "";
  const [notes, setNotes] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(initial);
  }, [initial]);

  const dirty = notes !== initial;
  const filled = initial.trim().length > 0;
  const status = cardStatus(filled ? 1 : 0, 1);
  const summary =
    filled && initial.length > 80
      ? initial.substring(0, 80).replace(/\s+/g, " ") + "…"
      : filled
      ? initial
      : undefined;

  return (
    <PropertyCard
      icon={icon}
      title={title}
      summary={summary}
      status={status}
    >
      {(close) => (
        <div className="space-y-3">
          <Label>Notes</Label>
          <TextArea
            value={notes}
            onChange={setNotes}
            placeholder={placeholder || "Add anything useful…"}
            rows={14}
          />
          <p className="text-[11px] text-txt-tertiary">
            This card will grow structured fields later. For now everything goes
            into a free-text notes blob.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button
              onClick={async () => {
                if (!dirty) {
                  close();
                  return;
                }
                setSaving(true);
                await onSave(section, { notes });
                setSaving(false);
                close();
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </PropertyCard>
  );
}
