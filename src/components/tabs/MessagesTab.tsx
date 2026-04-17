"use client";

import { useState } from "react";
import { useEmails } from "@/lib/hooks";
import type { Email } from "@/lib/supabase";
import { Card, SectionTitle } from "@/components/ui";
import { Icon } from "@/components/Icon";

/**
 * Messages tab
 *
 * Shows ONLY emails tagged as guest_message. Until the tagging pipeline is
 * built no emails will carry that tag, so this will stay empty — that is the
 * expected behavior for now.
 *
 * NOTE: This component accepts an optional `propertyId` so it can be rendered
 * inside a property view. Filtering by property will activate once the tagger
 * populates property_id.
 */
export function MessagesTab({ propertyId }: { propertyId?: string }) {
  const { data: messages, loading } = useEmails({ primaryTag: "guest_message" });
  const scoped = propertyId
    ? messages.filter((m) => m.property_id === propertyId)
    : messages;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    const msg = scoped.find((m) => m.id === selectedId);
    if (!msg) return null;
    return <Thread email={msg} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="max-w-3xl">
      <SectionTitle>{propertyId ? "Messages" : "All Messages"}</SectionTitle>

      {loading && (
        <p className="text-txt-secondary text-sm">Loading…</p>
      )}

      {!loading && scoped.length === 0 && (
        <Card className="text-center py-10">
          <Icon name="forum" className="text-3xl text-txt-tertiary" />
          <p className="text-sm text-txt-secondary mt-2">No guest messages yet.</p>
          <p className="text-xs text-txt-tertiary mt-1">
            Messages here will appear when emails are tagged as{" "}
            <code className="bg-surface-soft px-1 rounded">guest_message</code>.
            Tagging is a separate feature that hasn&apos;t been built yet — use
            the Inbox tab to see all ingested emails.
          </p>
        </Card>
      )}

      {!loading && scoped.map((m) => (
        <Row key={m.id} email={m} onClick={() => setSelectedId(m.id)} />
      ))}
    </div>
  );
}

function Row({ email, onClick }: { email: Email; onClick: () => void }) {
  const initial = (email.from_name || email.from_addr || "?").charAt(0).toUpperCase();
  return (
    <div
      onClick={onClick}
      className="flex gap-3 py-3 border-b border-surface-muted cursor-pointer hover:bg-surface-soft transition-colors rounded-lg px-2 -mx-2"
    >
      <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center font-bold text-base flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span
            className={
              "text-[15px] " + (email.read ? "font-medium" : "font-bold")
            }
          >
            {email.from_name || email.from_addr}
          </span>
          <span className="text-xs text-txt-secondary">
            {new Date(email.received_at).toLocaleDateString()}
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
      </div>
    </div>
  );
}

function Thread({ email, onBack }: { email: Email; onBack: () => void }) {
  return (
    <div className="max-w-2xl">
      <button
        onClick={onBack}
        className="text-brand font-semibold text-sm mb-4 cursor-pointer"
      >
        {"< Back to messages"}
      </button>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center font-bold text-lg">
          {(email.from_name || email.from_addr).charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-lg">
            {email.from_name || email.from_addr}
          </div>
          <div className="text-xs text-txt-secondary">
            {new Date(email.received_at).toLocaleString()}
          </div>
        </div>
      </div>
      <Card>
        <div className="text-base font-bold mb-3">
          {email.subject || "(no subject)"}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-txt">
          {email.body_text || "(empty body)"}
        </div>
      </Card>
    </div>
  );
}
