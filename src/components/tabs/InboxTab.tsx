"use client";

import { useState, useMemo } from "react";
import { useMessages, useMessageThreads } from "@/lib/hooks";
import { Card, SectionTitle, Badge } from "@/components/ui";

type FilterKey = "all" | "anjeyka" | "joanna";

const FILTERS: { key: FilterKey; label: string; match: (body: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "anjeyka",
    label: "To anjeyka@yahoo.com",
    match: (body) => body.toLowerCase().includes("anjeyka@yahoo.com"),
  },
  {
    key: "joanna",
    label: "To bisjoanna@yahoo.com",
    match: (body) => body.toLowerCase().includes("bisjoanna@yahoo.com"),
  },
];

export function InboxTab() {
  const { data: messages, loading } = useMessages();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Only show rows we ingested as raw email (platform === "Email").
  const emailRows = useMemo(
    () => messages.filter((m) => m.platform === "Email"),
    [messages]
  );

  if (selectedId) {
    const msg = emailRows.find((m) => m.id === selectedId);
    if (!msg) return null;
    return <EmailDetail msg={msg} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="max-w-3xl">
      <SectionTitle>Inbox</SectionTitle>
      <p className="text-txt-secondary text-sm mb-4">
        Raw emails pulled from the connected Yahoo account. Nothing is filtered
        out here — use the chips below to narrow down.
      </p>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              "px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors " +
              (filter === f.key
                ? "border-brand bg-brand/10 text-brand"
                : "border-surface-muted text-txt-secondary")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-txt-secondary text-sm">Loading...</p>}

      {!loading && emailRows.length === 0 && (
        <Card>
          <p className="text-txt-secondary text-sm">
            No emails ingested yet. Trigger{" "}
            <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">
              /api/email-webhook?run=1
            </code>{" "}
            to pull the most recent emails from your Yahoo inbox.
          </p>
        </Card>
      )}

      <FilteredList
        rows={emailRows}
        filter={filter}
        onSelect={(id) => setSelectedId(id)}
      />
    </div>
  );
}

function FilteredList({
  rows,
  filter,
  onSelect,
}: {
  rows: ReturnType<typeof useMessages>["data"];
  filter: FilterKey;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      {rows.map((m) => (
        <InboxRow
          key={m.id}
          messageId={m.id}
          guestName={m.guest_name}
          platform={m.platform}
          previewKey={m.last_message_preview}
          unread={m.unread}
          lastAt={m.last_message_at}
          filter={filter}
          onSelect={() => onSelect(m.id)}
        />
      ))}
    </div>
  );
}

function InboxRow({
  messageId,
  guestName,
  platform,
  previewKey,
  unread,
  lastAt,
  filter,
  onSelect,
}: {
  messageId: string;
  guestName: string;
  platform: string;
  previewKey: string;
  unread: boolean;
  lastAt: string;
  filter: FilterKey;
  onSelect: () => void;
}) {
  const { data: threads } = useMessageThreads(messageId);
  const body = threads[0]?.text || "";

  // Extract Subject line from stored body ("From: ...\nTo: ...\nDate: ...\nSubject: ...").
  const subjectMatch = body.match(/Subject:\s*(.+)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : "(no subject)";

  const filterDef = FILTERS.find((f) => f.key === filter);
  const matches = filterDef ? filterDef.match(body) : true;
  if (!matches) return null;

  const date = lastAt ? new Date(lastAt).toLocaleString() : "";

  return (
    <div
      onClick={onSelect}
      className="flex gap-3 py-3 border-b border-surface-muted cursor-pointer hover:bg-surface-soft transition-colors rounded-lg px-2 -mx-2"
    >
      <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center font-bold text-base flex-shrink-0">
        {guestName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
          <span className={"text-[15px] truncate " + (unread ? "font-bold" : "font-medium")}>
            {guestName}
          </span>
          <span className="text-xs text-txt-secondary flex-shrink-0">{date}</span>
        </div>
        <div
          className={
            "text-sm truncate " + (unread ? "text-txt font-semibold" : "text-txt-secondary")
          }
        >
          {subject}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge color="gray">{platform}</Badge>
        </div>
      </div>
    </div>
  );
}

function EmailDetail({
  msg,
  onBack,
}: {
  msg: ReturnType<typeof useMessages>["data"][number];
  onBack: () => void;
}) {
  const { data: threads, loading } = useMessageThreads(msg.id);
  const body = threads[0]?.text || "";

  const fromMatch = body.match(/From:\s*(.+)/);
  const toMatch = body.match(/To:\s*(.+)/);
  const dateMatch = body.match(/Date:\s*(.+)/);
  const subjectMatch = body.match(/Subject:\s*(.+)/);

  return (
    <div className="max-w-2xl">
      <button
        onClick={onBack}
        className="text-brand font-semibold text-sm mb-4 cursor-pointer"
      >
        {"< Back to inbox"}
      </button>

      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center font-bold text-lg">
          {msg.guest_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-lg">{msg.guest_name}</div>
          <div className="text-xs text-txt-secondary">{msg.platform}</div>
        </div>
      </div>

      {loading && <p className="text-txt-secondary text-sm">Loading email...</p>}

      {!loading && (
        <Card>
          <div className="text-sm leading-7 font-mono whitespace-pre-wrap">
            {subjectMatch && (
              <div>
                <span className="text-txt-secondary">Subject:</span>{" "}
                <span className="font-semibold">{subjectMatch[1].trim()}</span>
              </div>
            )}
            {fromMatch && (
              <div>
                <span className="text-txt-secondary">From:</span> {fromMatch[1].trim()}
              </div>
            )}
            {toMatch && (
              <div>
                <span className="text-txt-secondary">To:</span> {toMatch[1].trim()}
              </div>
            )}
            {dateMatch && (
              <div>
                <span className="text-txt-secondary">Date:</span> {dateMatch[1].trim()}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
