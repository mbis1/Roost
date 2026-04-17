"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useUserSettings } from "@/lib/hooks";

/**
 * Top-right profile button + dropdown menu.
 *
 * Today this is a stub — no real auth yet. It pulls the display name from
 * the user_settings row (first part of email, or "You") so there's always
 * something to show, and exposes the Settings action. When real Supabase
 * auth is wired in, swap the name source for the authenticated user object
 * and enable the Log out item.
 */
export function ProfileMenu({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { settings } = useUserSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const email = settings?.email || "";
  const displayName = email
    ? email.split("@")[0].replace(/[._]/g, " ")
    : "You";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-transparent hover:border-surface-muted transition-colors cursor-pointer"
        title={displayName}
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white text-xs font-bold flex items-center justify-center">
          {initial}
        </div>
        <span className="text-xs font-semibold text-txt capitalize hidden sm:inline">
          {displayName}
        </span>
        <Icon name="expand_more" className="text-sm text-txt-tertiary" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-surface-muted overflow-hidden z-50">
          <div className="px-3 py-3 border-b border-surface-muted">
            <div className="text-xs text-txt-tertiary uppercase tracking-wide font-bold">
              Signed in
            </div>
            <div className="text-sm font-semibold capitalize mt-0.5">
              {displayName}
            </div>
            {email && (
              <div className="text-xs text-txt-secondary truncate">
                {email}
              </div>
            )}
          </div>

          <MenuItem
            icon="settings"
            label="Settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          />

          <div className="border-t border-surface-muted" />

          <MenuItem
            icon="logout"
            label="Log out"
            disabled
            hint="Available once auth is wired up"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={
        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors " +
        (disabled
          ? "text-txt-tertiary cursor-not-allowed"
          : "text-txt hover:bg-surface-soft cursor-pointer")
      }
    >
      <Icon name={icon} className="text-base" />
      <span className="flex-1">{label}</span>
    </button>
  );
}
