"use client";

import { useState, useMemo } from "react";
import { useEmails } from "@/lib/hooks";
import type { Email } from "@/lib/supabase";
import { Icon } from "@/components/Icon";

type CategoryKey =
  | "all"
  | "guest_message"
  | "booking"
  | "payout"
  | "review"
  | "expense"
  | "bill"
  | "vendor"
  | "maintenance"
  | "personal"
  | "untagged";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "guest_message", label: "Guest messages" },
  { key: "booking", label: "Bookings" },
  { key: "payout", label: "Payouts" },
  { key: "review", label: "Reviews" },
  { key: "expense", label: "Expenses" },
  { key: "bill", label: "Bills" },
  { key: "vendor", label: "Vendors" },
  { key: "maintenance", label: "Maintenance" },
  { key: "personal", label: "Personal" },
  { key: "untagged", label: "Untagged" },
];

export function InboxTab() {
  const [sortAsc, setSortAsc] = useState(false);
  const { data: emails, loading } = useEmails({ orderAsc: sortAsc });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryKey>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((e) => {
      if (category === "all") {
        // pass
      } else if (category === "untagged") {
        if (e.primary_tag !== null) return false;
      } else {
        if (e.primary_tag !== category) return false;
      }
      if (!q) return true;
      const hay = [
        e.from_addr,
        e.from_name,
        e.subject,
        e.body_text,
        e.to_addr,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [emails, category, query]);

  const selected = filtered.find((e) => e.id === selectedId) || null;

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="inbox" className="text-2xl text-txt-secondary" />
          <h2 className="text-xl font-extrabold">Inbox</h2>
          <span className="text-xs text-txt-secondary ml-2">
            {filtered.length} of {emails.length}
          </span>
        </div>
        <button
          onClick={() => setSortAsc((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-surface-muted text-xs font-semibold text-txt-secondary hover:border-txt-secondary transition-colors cursor-pointer"
          title="Toggle sort"
        >
          <Icon name={sortAsc ? "arrow_upward" : "arrow_downward"} className="text-sm" />
          {sortAsc ? "Oldest first" : "Newest first"}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 bg-white/70 backdrop-blur-xl border border-surface-muted rounded-xl px-3 py-2">
        <Icon name="search" className="text-txt-tertiary text-lg" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by sender, subject, or body…"
          className="flex-1 bg-transparent outline-none text-sm placeholder-txt-tertiary"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-txt-tertiary hover:text-txt-secondary cursor-pointer"
            title="Clear"
          >
            <Icon name="close" className="text-sm" />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={
                "px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors " +
                (active
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-surface-muted bg-white/60 text-txt-secondary hover:border-txt-secondary")
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-txt-secondary text-sm">Loading emails…</p>
      )}

      {!loading && emails.length === 0 && (
        <div className="bg-white rounded-xl border border-surface-muted p-6 text-center">
          <Icon name="mark_email_unread" className="text-3xl text-txt-tertiary" />
          <p className="text-sm text-txt-secondary mt-2">
            No emails yet. Seed the <code>emails</code> table in Supabase to see
            the inbox populated.
          </p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div className="flex gap-4 items-start">
          <div
            className={
              "bg-white/60 backdrop-blur-xl border border-surface-muted rounded-xl overflow-hidden " +
              (selected ? "w-[360px] flex-shrink-0" : "flex-1")
            }
          >
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-txt-secondary">
                No emails match this filter.
              </div>
            )}
            {filtered.map((e) => (
              <InboxRow
                key={e.id}
                email={e}
                active={selectedId === e.id}
                onClick={() => setSelectedId(e.id)}
              />
            ))}
          </div>

          {selected && (
            <EmailReader
              email={selected}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InboxRow({
  email,
  active,
  onClick,
}: {
  email: Email;
  active: boolean;
  onClick: () => void;
}) {
  const initial = (email.from_name || email.from_addr || "?").charAt(0).toUpperCase();
  const timestamp = formatRelative(email.received_at);
  const preview = (email.body_text || "").substring(0, 120).replace(/\s+/g, " ");

  return (
    <div
      onClick={onClick}
      className={
        "flex gap-3 px-4 py-3 border-b border-surface-muted cursor-pointer transition-colors " +
        (active ? "bg-brand/5" : "hover:bg-surface-soft")
      }
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white flex items-center justify-center font-bold text-base">
          {initial}
        </div>
        {!email.read && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={
              "text-sm truncate " + (email.read ? "text-txt" : "font-bold text-txt")
            }
          >
            {email.from_name || email.from_addr}
          </span>
          <span className="text-[11px] text-txt-tertiary flex-shrink-0">
            {timestamp}
          </span>
        </div>
        <div
          className={
            "text-sm truncate " +
            (email.read ? "text-txt-secondary" : "text-txt font-semibold")
          }
        >
          {email.subject || "(no subject)"}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-txt-tertiary truncate flex-1">
            {preview}
          </span>
          {email.primary_tag && (
            <span className="text-[10px] font-semibold text-txt-secondary bg-surface-soft px-1.5 py-0.5 rounded">
              {email.primary_tag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailReader({
  email,
  onClose,
}: {
  email: Email;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 bg-white/80 backdrop-blur-xl border border-surface-muted rounded-xl overflow-hidden sticky top-4">
      <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-surface-muted">
        <div className="min-w-0">
          <div className="text-lg font-extrabold mb-1 truncate">
            {email.subject || "(no subject)"}
          </div>
          <div className="text-xs text-txt-secondary">
            <span className="font-semibold text-txt">
              {email.from_name || email.from_addr}
            </span>{" "}
            <span className="text-txt-tertiary">&lt;{email.from_addr}&gt;</span>
          </div>
          <div className="text-xs text-txt-secondary mt-0.5">
            to {email.to_addr} · {new Date(email.received_at).toLocaleString()}
          </div>
          {email.primary_tag && (
            <span className="inline-block mt-2 text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded">
              {email.primary_tag}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-txt-tertiary hover:text-txt cursor-pointer flex-shrink-0 ml-3"
          title="Close"
        >
          <Icon name="close" className="text-lg" />
        </button>
      </div>
      <div className="p-5 text-sm leading-relaxed whitespace-pre-wrap text-txt">
        {email.body_text || "(empty body)"}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
