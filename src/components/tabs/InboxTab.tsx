"use client";

import { useState, useMemo } from "react";
import {
  useEmails,
  useProperties,
  assignEmailToProperty,
  setEmailPrimaryTag,
} from "@/lib/hooks";
import type { Email, Property } from "@/lib/supabase";
import { Icon } from "@/components/Icon";
import { PRIMARY_TAGS } from "@/lib/categorize-tags";

/* ------------------------------------------------------------------ */
/* Filter chip definitions                                            */
/* ------------------------------------------------------------------ */

type ChipKey =
  | "all_non_personal"
  | "guest_message"
  | "booking"
  | "payout"
  | "review"
  | "hoa"
  | "utility"
  | "mortgage"
  | "vendor"
  | "legal"
  | "expense"
  | "platform_notice"
  | "personal"
  | "spam"
  | "untagged";

type ChipDef = {
  key: ChipKey;
  label: string;
  /** True when the chip is for "low-priority" content — Personal / Spam.
   *  Visually dimmer; visually separated from the main chip row. */
  dim?: boolean;
};

const PRIMARY_CHIPS: ChipDef[] = [
  { key: "all_non_personal", label: "All — non-personal" },
  { key: "guest_message", label: "Guest messages" },
  { key: "booking", label: "Bookings" },
  { key: "payout", label: "Payouts" },
  { key: "review", label: "Reviews" },
  { key: "hoa", label: "HOA" },
  { key: "utility", label: "Utilities" },
  { key: "mortgage", label: "Mortgage" },
  { key: "vendor", label: "Vendors" },
  { key: "legal", label: "Legal" },
  { key: "expense", label: "Expenses" },
  { key: "platform_notice", label: "Platform notices" },
];

const FOLDER_CHIPS: ChipDef[] = [
  { key: "personal", label: "Personal", dim: true },
  { key: "spam", label: "Spam", dim: true },
  { key: "untagged", label: "Untagged", dim: true },
];

/** Color treatment for primary_tag badges in the row + reader. */
const TAG_BADGE_CLASS: Record<string, string> = {
  guest_message: "bg-status-blue-bg text-status-blue",
  booking: "bg-status-green-bg text-status-green",
  payout: "bg-status-green-bg text-status-green",
  review: "bg-status-blue-bg text-status-blue",
  expense: "bg-status-orange-bg text-status-orange",
  utility: "bg-status-orange-bg text-status-orange",
  mortgage: "bg-status-orange-bg text-status-orange",
  hoa: "bg-status-orange-bg text-status-orange",
  vendor: "bg-status-blue-bg text-status-blue",
  legal: "bg-status-red-bg text-status-red",
  platform_notice: "bg-surface-soft text-txt-secondary",
  personal: "bg-surface-soft text-txt-tertiary",
  spam: "bg-surface-soft text-txt-tertiary",
  other: "bg-surface-soft text-txt-tertiary",
};

function tagBadgeClass(tag: string | null): string {
  if (!tag) return "bg-surface-soft text-txt-tertiary";
  return TAG_BADGE_CLASS[tag] || "bg-surface-soft text-txt-secondary";
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function InboxTab() {
  const [sortAsc, setSortAsc] = useState(false);
  const { data: emails, loading, refetch } = useEmails({ orderAsc: sortAsc });
  const { data: properties } = useProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chip, setChip] = useState<ChipKey>("all_non_personal");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((e) => {
      // Chip filter
      if (chip === "all_non_personal") {
        if (e.primary_tag === "personal" || e.primary_tag === "spam")
          return false;
      } else if (chip === "untagged") {
        if (e.primary_tag !== null && e.primary_tag !== "other") return false;
      } else {
        if (e.primary_tag !== chip) return false;
      }
      // Query
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
  }, [emails, chip, query]);

  const selected = filtered.find((e) => e.id === selectedId) || null;

  // Whether the open chip is in the dimmer "folder" group, used to mute
  // the row colors slightly when looking at Personal / Spam / Untagged.
  const inFolderView =
    chip === "personal" || chip === "spam" || chip === "untagged";

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
          <Icon
            name={sortAsc ? "arrow_upward" : "arrow_downward"}
            className="text-sm"
          />
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

      {/* Primary chips */}
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {PRIMARY_CHIPS.map((c) => {
          const active = chip === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
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

      {/* Folder-style chips (Personal / Spam / Untagged) */}
      <div className="flex gap-1.5 mb-4 flex-wrap pt-2 border-t border-dashed border-surface-muted">
        <span className="text-[10px] font-bold text-txt-tertiary uppercase tracking-wide self-center mr-1">
          Folders
        </span>
        {FOLDER_CHIPS.map((c) => {
          const active = chip === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
              className={
                "px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors " +
                (active
                  ? "border-txt-tertiary bg-surface-soft text-txt"
                  : "border-dashed border-surface-muted bg-white/40 text-txt-tertiary hover:border-txt-tertiary")
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
          <Icon
            name="mark_email_unread"
            className="text-3xl text-txt-tertiary"
          />
          <p className="text-sm text-txt-secondary mt-2">
            No emails yet. Run the email-webhook to ingest, then re-check
            here.
          </p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div className="flex gap-4 items-start">
          <div
            className={
              "bg-white/60 backdrop-blur-xl border border-surface-muted rounded-xl overflow-hidden " +
              (selected ? "w-[360px] flex-shrink-0" : "flex-1") +
              (inFolderView ? " opacity-90" : "")
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
                dim={
                  e.primary_tag === "personal" || e.primary_tag === "spam"
                }
                onClick={() => setSelectedId(e.id)}
              />
            ))}
          </div>

          {selected && (
            <EmailReader
              email={selected}
              properties={properties}
              onAssigned={refetch}
              onCategoryChanged={refetch}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                */
/* ------------------------------------------------------------------ */

function InboxRow({
  email,
  active,
  dim,
  onClick,
}: {
  email: Email;
  active: boolean;
  dim: boolean;
  onClick: () => void;
}) {
  const initial = (email.from_name || email.from_addr || "?")
    .charAt(0)
    .toUpperCase();
  const timestamp = formatRelative(email.received_at);
  const preview = (email.body_text || "")
    .substring(0, 120)
    .replace(/\s+/g, " ");
  const sec = email.secondary_tags || [];
  const isUrgent = sec.includes("urgent");
  const needsAction = sec.includes("needs_action");

  return (
    <div
      onClick={onClick}
      className={
        "flex gap-3 px-4 py-3 border-b border-surface-muted cursor-pointer transition-colors " +
        (active ? "bg-brand/5" : "hover:bg-surface-soft") +
        (dim ? " opacity-65" : "")
      }
    >
      <div className="relative flex-shrink-0">
        <div
          className={
            "w-10 h-10 rounded-full flex items-center justify-center font-bold text-base text-white " +
            (dim
              ? "bg-gradient-to-br from-txt-tertiary to-txt-secondary"
              : "bg-gradient-to-br from-brand to-brand-dark")
          }
        >
          {initial}
        </div>
        {!email.read && !dim && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand border-2 border-white" />
        )}
        {(isUrgent || needsAction) && (
          <span
            title={isUrgent ? "Urgent" : "Needs action"}
            className={
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white " +
              (isUrgent ? "bg-status-red" : "bg-status-orange")
            }
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={
              "text-sm truncate " +
              (email.read ? "text-txt" : "font-bold text-txt")
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
            (email.read
              ? "text-txt-secondary"
              : "text-txt font-semibold")
          }
        >
          {email.subject || "(no subject)"}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {email.primary_tag && (
            <span
              className={
                "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 " +
                tagBadgeClass(email.primary_tag)
              }
            >
              {email.primary_tag}
            </span>
          )}
          <span className="text-xs text-txt-tertiary truncate flex-1">
            {preview}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reader (with re-categorize dropdown)                               */
/* ------------------------------------------------------------------ */

function EmailReader({
  email,
  properties,
  onAssigned,
  onCategoryChanged,
  onClose,
}: {
  email: Email;
  properties: Property[];
  onAssigned: () => void;
  onCategoryChanged: () => void;
  onClose: () => void;
}) {
  const assigned = email.property_id
    ? properties.find((p) => p.id === email.property_id)
    : null;

  const handleAssign = async (value: string) => {
    const next = value || null;
    await assignEmailToProperty(email.id, next);
    onAssigned();
  };

  const handleRecategorize = async (newTag: string) => {
    if (!newTag || newTag === email.primary_tag) return;
    await setEmailPrimaryTag(email.id, newTag, email.primary_tag);
    onCategoryChanged();
  };

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
            <span className="text-txt-tertiary">
              &lt;{email.from_addr}&gt;
            </span>
          </div>
          <div className="text-xs text-txt-secondary mt-0.5">
            to {email.to_addr} ·{" "}
            {new Date(email.received_at).toLocaleString()}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {email.primary_tag && (
              <span
                className={
                  "text-[10px] font-semibold px-2 py-0.5 rounded " +
                  tagBadgeClass(email.primary_tag)
                }
              >
                {email.primary_tag}
              </span>
            )}
            {(email.secondary_tags || []).map((t) => (
              <span
                key={t}
                className="text-[10px] font-semibold text-txt-secondary bg-surface-soft px-2 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
            {assigned && (
              <span className="text-[10px] font-semibold text-status-green bg-status-green-bg px-2 py-0.5 rounded flex items-center gap-1">
                <Icon name="home_work" className="text-xs" />
                {assigned.nickname || assigned.name}
              </span>
            )}
          </div>
          {email.ai_summary && (
            <div className="text-xs text-txt-secondary italic mt-2 leading-relaxed">
              <Icon
                name="auto_awesome"
                className="text-xs text-brand mr-1 align-text-bottom"
              />
              {email.ai_summary}
            </div>
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

      <div className="flex items-center gap-2 px-5 py-2 border-b border-surface-muted bg-surface-soft/40">
        <Icon name="label" className="text-txt-secondary text-sm" />
        <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wide">
          Category
        </span>
        <select
          value={email.primary_tag || ""}
          onChange={(e) => handleRecategorize(e.target.value)}
          className="px-2 py-1 bg-white border border-surface-muted rounded text-xs outline-none focus:border-brand"
          title="Re-categorize this email"
        >
          {!email.primary_tag && <option value="">— uncategorized —</option>}
          {PRIMARY_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-txt-tertiary mx-2">·</span>
        <Icon name="home_work" className="text-txt-secondary text-sm" />
        <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wide">
          Property
        </span>
        <select
          value={email.property_id || ""}
          onChange={(e) => handleAssign(e.target.value)}
          className="flex-1 px-2 py-1 bg-white border border-surface-muted rounded text-xs outline-none focus:border-brand"
        >
          <option value="">— Unassigned —</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname || p.name}
            </option>
          ))}
        </select>
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
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
