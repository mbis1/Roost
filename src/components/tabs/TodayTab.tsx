"use client";

import { useTasks, useMessages, useProperties, updateRow } from "@/lib/hooks";
import { Card, SectionTitle, Badge, StatusBadge, Button, DollarInt } from "@/components/ui";

export function TodayTab() {
  const { data: tasks, refetch: refetchTasks } = useTasks();
  const { data: messages } = useMessages();
  const { data: properties } = useProperties();

  const urgent = tasks.filter((t) => t.status === "urgent" || t.status === "overdue");
  const upcoming = tasks.filter((t) => t.status === "upcoming");
  const unread = messages.filter((m) => m.unread);
  const avgRating = properties.length > 0
    ? properties.reduce((s, p) => s + p.rating, 0) / properties.length : 0;
  const totalReviews = properties.reduce((s, p) => s + p.reviews_count, 0);

  const markDone = async (id: string) => {
    await updateRow("tasks", id, { status: "done", last_completed_at: new Date().toISOString() });
    refetchTasks();
  };

  return (
    <div className="max-w-3xl">
      <SectionTitle>Today</SectionTitle>
      <p className="text-txt-secondary text-sm mb-6">
        {urgent.length + " actions needed, " + unread.length + " unread messages"}
      </p>
      {urgent.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-bold text-status-red uppercase tracking-wide mb-2">Needs Attention</div>
          {urgent.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3.5 bg-status-red-bg rounded-xl mb-2">
              <div>
                <div className="font-semibold text-sm">{t.task}</div>
                <div className="text-xs text-txt-secondary mt-0.5">
                  {[t.notes, t.assigned_to, t.due_date].filter(Boolean).join(" . ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                <Button size="sm" onClick={() => markDone(t.id)}>Done</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card><div className="text-xs text-txt-secondary">Properties</div><div className="text-2xl font-extrabold mt-1">{properties.length}</div></Card>
        <Card><div className="text-xs text-txt-secondary">Avg Rating</div><div className="text-2xl font-extrabold mt-1">{"* " + avgRating.toFixed(2)}</div><div className="text-xs text-txt-secondary">{totalReviews + " reviews"}</div></Card>
        <Card><div className="text-xs text-txt-secondary">Unread</div><div className="text-2xl font-extrabold mt-1">{unread.length}</div><div className="text-xs text-txt-secondary">messages</div></Card>
      </div>
      {upcoming.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-bold text-txt-secondary uppercase tracking-wide mb-2">Upcoming</div>
          {upcoming.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 border border-surface-muted rounded-xl mb-1.5">
              <div><div className="font-medium text-sm">{t.task}</div><div className="text-xs text-txt-secondary">{t.due_date + " . " + (t.assigned_to || "Unassigned")}</div></div>
              <Badge color="gray">{t.type}</Badge>
            </div>
          ))}
        </div>
      )}
      {unread.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-txt-secondary uppercase tracking-wide mb-2">Unread Messages</div>
          {unread.slice(0, 4).map((m) => (
            <div key={m.id} className="flex gap-3 py-3 border-b border-surface-muted">
              <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{m.guest_name.charAt(0)}</div>
              <div className="flex-1 min-w-0"><div className="flex justify-between"><span className="font-bold text-sm">{m.guest_name}</span><span className="text-[11px] text-txt-secondary">{m.platform}</span></div><div className="text-xs text-txt-secondary truncate">{m.last_message_preview}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
