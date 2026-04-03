"use client";

import { useState } from "react";
import { useMessages, useMessageThreads, insertRow, updateRow } from "@/lib/hooks";
import { Card, SectionTitle, StatusBadge, Button, Input } from "@/components/ui";

export function MessagesTab({ propertyId }: { propertyId?: string }) {
  const { data: messages, refetch } = useMessages(propertyId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    const msg = messages.find((m) => m.id === selectedId);
    if (!msg) return null;
    return <ThreadView msg={msg} onBack={() => { setSelectedId(null); refetch(); }} />;
  }

  return (
    <div className="max-w-3xl">
      <SectionTitle>{propertyId ? "Messages" : "All Messages"}</SectionTitle>
      {messages.length === 0 && <p className="text-txt-secondary text-sm">No messages yet.</p>}
      {messages.map((m) => (
        <div key={m.id} onClick={() => { setSelectedId(m.id); if (m.unread) updateRow("messages", m.id, { unread: false }); }}
          className="flex gap-3 py-3 border-b border-surface-muted cursor-pointer hover:bg-surface-soft transition-colors rounded-lg px-2 -mx-2">
          <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center font-bold text-base flex-shrink-0">{m.guest_name.charAt(0)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className={"text-[15px] " + (m.unread ? "font-bold" : "font-medium")}>{m.guest_name}</span>
              <span className="text-xs text-txt-secondary">{m.platform}</span>
            </div>
            <div className={"text-sm truncate " + (m.unread ? "text-txt font-semibold" : "text-txt-secondary")}>{m.last_message_preview}</div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={m.status} />
              {m.booking_dates && <span className="text-xs text-txt-secondary">{m.booking_dates}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadView({ msg, onBack }: { msg: any; onBack: () => void }) {
  const { data: threads, refetch } = useMessageThreads(msg.id);
  const [newMsg, setNewMsg] = useState("");
  const [generating, setGenerating] = useState(false);

  const send = async () => {
    if (!newMsg.trim()) return;
    await insertRow("message_threads", { message_id: msg.id, sender: "host", text: newMsg, approved: true });
    await updateRow("messages", msg.id, { last_message_preview: "You: " + newMsg.substring(0, 50) });
    setNewMsg(""); refetch();
  };

  const generateDraft = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyName: "Property", guestName: msg.guest_name,
          guestMessage: threads.length > 0 ? threads[threads.length - 1].text : "",
          wifi: "", wifiPassword: "", lockCode: "", checkIn: "", checkOut: "", address: "",
          rules: { quietHours: "", parking: "", pets: "", smoking: "", maxGuests: "", checkInInstructions: "", checkOutInstructions: "" },
          tone: "friendly" }),
      });
      const data = await res.json();
      if (data.draft) setNewMsg(data.draft);
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-brand font-semibold text-sm mb-4 cursor-pointer">{"< Back to messages"}</button>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center font-bold text-lg">{msg.guest_name.charAt(0)}</div>
        <div><div className="font-bold text-lg">{msg.guest_name}</div><div className="text-xs text-txt-secondary">{msg.status + " . " + msg.booking_dates + " . " + msg.platform}</div></div>
      </div>
      <div className="flex flex-col gap-3 mb-5">
        {threads.map((t: any) => (
          <div key={t.id} className={"flex " + (t.sender === "host" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed " +
              (t.sender === "host" ? "bg-brand text-white" : t.sender === "system" ? "bg-status-orange-bg text-txt" :
               t.sender === "ai_draft" ? "bg-status-blue-bg text-txt border border-status-blue" : "bg-surface-soft text-txt")}>
              {t.sender === "system" && <div className="text-[10px] font-bold text-status-orange mb-1">SYSTEM</div>}
              {t.sender === "ai_draft" && <div className="text-[10px] font-bold text-status-blue mb-1">AI DRAFT</div>}
              {t.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 sticky bottom-0 bg-surface-soft py-3">
        <Button variant="ghost" size="sm" onClick={generateDraft}>{generating ? "Generating..." : "AI Draft"}</Button>
        <Input value={newMsg} onChange={setNewMsg} placeholder="Type a message..." />
        <Button onClick={send}>Send</Button>
      </div>
    </div>
  );
}
