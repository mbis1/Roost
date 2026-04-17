"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAuth, displayName } from "@/lib/useAuth";

/**
 * Top-right profile button + dropdown menu. Pulls the current user from
 * Supabase auth, shows their display name + email, and provides Log out.
 */
export function ProfileMenu({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const name = displayName(user);
  const initial = name.charAt(0).toUpperCase() || "?";
  const email = user?.email || "";

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

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-transparent hover:border-surface-muted transition-colors cursor-pointer"
        title={name}
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white text-xs font-bold flex items-center justify-center">
          {initial}
        </div>
        <span className="text-xs font-semibold text-txt capitalize hidden sm:inline">
          {name}
        </span>
        <Icon name="expand_more" className="text-sm text-txt-tertiary" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-surface-muted overflow-hidden z-50">
          <div className="px-3 py-3 border-b border-surface-muted">
            <div className="text-xs text-txt-tertiary uppercase tracking-wide font-bold">
              Signed in
            </div>
            <div className="text-sm font-semibold capitalize mt-0.5 truncate">
              {name}
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

          <MenuItem icon="logout" label="Log out" onClick={handleLogout} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors text-txt hover:bg-surface-soft cursor-pointer"
    >
      <Icon name={icon} className="text-base" />
      <span className="flex-1">{label}</span>
    </button>
  );
}
