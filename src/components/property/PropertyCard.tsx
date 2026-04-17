"use client";

import { ReactNode, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";

export type CardStatus = "empty" | "partial" | "complete";

export function cardStatus(filledFields: number, totalFields: number): CardStatus {
  if (filledFields === 0) return "empty";
  if (filledFields >= totalFields) return "complete";
  return "partial";
}

/**
 * Generic card used throughout the Property Hub. Handles the collapsed tile
 * display and the side-panel expansion.
 */
export function PropertyCard({
  icon,
  title,
  summary,
  status,
  full,
  children,
}: {
  icon: string;
  title: string;
  summary?: string;
  status: CardStatus;
  full?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const statusMeta: Record<CardStatus, { label: string; cls: string }> = {
    empty: {
      label: "Not configured",
      cls: "text-txt-tertiary",
    },
    partial: {
      label: "Partial",
      cls: "text-status-orange",
    },
    complete: {
      label: "Configured",
      cls: "text-status-green",
    },
  };

  const tileClass = clsx(
    "group flex flex-col gap-2 rounded-2xl p-4 bg-white/70 backdrop-blur-xl transition-all cursor-pointer",
    status === "empty"
      ? "border border-dashed border-surface-muted hover:border-txt-secondary"
      : "border border-surface-muted hover:border-brand hover:shadow-sm"
  );

  return (
    <>
      <button className={tileClass} onClick={() => setOpen(true)}>
        <div className="flex items-center gap-2">
          <Icon name={icon} className="text-xl text-txt-secondary" />
          <span className="font-bold text-sm text-txt">{title}</span>
          {!full && (
            <span className="ml-auto text-[9px] font-bold text-txt-tertiary bg-surface-soft px-1.5 py-0.5 rounded uppercase tracking-wide">
              Notes
            </span>
          )}
        </div>

        <div
          className={clsx(
            "text-xs leading-snug text-left",
            status === "empty" ? "text-txt-tertiary" : "text-txt-secondary"
          )}
        >
          {summary ||
            (status === "empty"
              ? "Add details for this property"
              : "Click to view")}
        </div>

        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide mt-1">
          <span className={statusMeta[status].cls}>
            {statusMeta[status].label}
          </span>
          <span className="text-brand flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {status === "empty" ? "Add details" : "Edit"}
            <Icon name="chevron_right" className="text-sm" />
          </span>
        </div>
      </button>

      {open && (
        <CardSidePanel title={title} icon={icon} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </CardSidePanel>
      )}
    </>
  );
}

function CardSidePanel({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-muted sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Icon name={icon} className="text-2xl text-brand" filled />
            <h3 className="text-lg font-extrabold">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt cursor-pointer"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
