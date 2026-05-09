// src/components/calendar/PriceEditModal.tsx
//
// Sprint E — modal for editing pricing overrides. Supports a single date
// or a small range (start..end inclusive). Pre-fills with the current
// override price (if any) or the base rate.

"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Input, FormField, Label } from "@/components/ui";

export type PriceEditScope = {
  /** Inclusive start date in YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end date in YYYY-MM-DD. Same as start for single-day edit. */
  endDate: string;
  /** Initial price to seed the form (override or base rate). */
  initialPrice: number | null;
  /** Initial note to seed the form. */
  initialNote?: string | null;
  /** True if there's already an override on the start date — enables Reset. */
  hasOverride: boolean;
};

export function PriceEditModal({
  scope,
  onClose,
  onSave,
  onReset,
}: {
  scope: PriceEditScope;
  onClose: () => void;
  onSave: (price: number, note: string) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [price, setPrice] = useState<string>(
    scope.initialPrice != null ? String(scope.initialPrice) : ""
  );
  const [note, setNote] = useState<string>(scope.initialNote || "");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrice(scope.initialPrice != null ? String(scope.initialPrice) : "");
    setNote(scope.initialNote || "");
    setError(null);
  }, [scope.startDate, scope.endDate, scope.initialPrice, scope.initialNote]);

  const handleSave = async () => {
    const parsed = parseFloat(price);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Enter a valid non-negative price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed, note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      await onReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  const isRange = scope.startDate !== scope.endDate;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-full bg-white rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-muted">
          <div className="flex items-center gap-2">
            <Icon name="payments" className="text-xl text-brand" />
            <h3 className="text-base font-extrabold">
              {isRange ? "Set price for range" : "Set price for date"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt cursor-pointer"
            aria-label="Close"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg bg-surface-soft border border-surface-muted px-3 py-2 text-sm text-txt-secondary">
            <Icon
              name="calendar_today"
              className="text-xs mr-1 align-text-bottom"
            />
            {fmtDate(scope.startDate)}
            {isRange && (
              <>
                {" "}
                → {fmtDate(scope.endDate)}{" "}
                <span className="text-[11px] text-txt-tertiary">
                  ({rangeLength(scope.startDate, scope.endDate)} nights)
                </span>
              </>
            )}
          </div>

          <FormField label="Price (USD per night)">
            <Input
              type="number"
              value={price}
              onChange={setPrice}
              placeholder="e.g. 199"
            />
          </FormField>

          <div>
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={setNote}
              placeholder="e.g. Memorial Day weekend bump"
            />
          </div>

          {error && (
            <p className="text-[11px] text-status-red font-semibold">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-surface-muted bg-surface-soft/40">
          <div>
            {scope.hasOverride && !isRange && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                {resetting ? "Resetting…" : "↺ Reset to base"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rangeLength(start: string, end: string): number {
  return Math.max(
    1,
    Math.round(
      (new Date(end + "T12:00:00Z").getTime() -
        new Date(start + "T12:00:00Z").getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1
  );
}
