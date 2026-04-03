"use client";

import { useState } from "react";
import { useCalendarFeeds, insertRow, updateRow, deleteRow } from "@/lib/hooks";
import type { Property } from "@/lib/supabase";
import { Card, SectionTitle, Label, Input, Select, Button, Badge } from "@/components/ui";

export function CalendarTab({ property }: { property: Property }) {
  const { data: feeds, refetch } = useCalendarFeeds(property.id);
  const [syncing, setSyncing] = useState<string | null>(null);

  const addFeed = async () => { await insertRow("calendar_feeds", { property_id: property.id, platform: "Airbnb", ical_url: "" }); refetch(); };
  const updateFeed = async (id: string, field: string, value: string) => { await updateRow("calendar_feeds", id, { [field]: value }); refetch(); };
  const removeFeed = async (id: string) => { await deleteRow("calendar_feeds", id); refetch(); };
  const syncFeed = async (id: string, url: string, platform: string) => {
    if (!url) return; setSyncing(id);
    try {
      const res = await fetch("/api/ical-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, platform }) });
      const data = await res.json();
      if (data.success) { await updateRow("calendar_feeds", id, { last_synced_at: data.synced_at }); refetch(); }
    } catch (e) { console.error(e); }
    setSyncing(null);
  };

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const monthName = today.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="max-w-3xl">
      <SectionTitle>Calendar</SectionTitle>
      <Card className="mb-4 bg-status-orange-bg border-orange-200"><p className="text-sm text-status-orange"><b>iCal Sync:</b> Add calendar URLs from Airbnb, VRBO, Booking.com.</p></Card>
      {feeds.map((f) => (
        <div key={f.id} className="flex gap-2 mb-2 items-end">
          <div className="w-28"><Label>Platform</Label><Select value={f.platform} onChange={(v) => updateFeed(f.id, "platform", v)} options={["Airbnb", "VRBO", "Booking.com", "Direct", "Other"]} /></div>
          <div className="flex-1"><Label>iCal URL</Label><Input value={f.ical_url} onChange={(v) => updateFeed(f.id, "ical_url", v)} placeholder="https://...ical/xxxxx.ics" /></div>
          <Button variant="ghost" size="sm" onClick={() => syncFeed(f.id, f.ical_url, f.platform)}>{syncing === f.id ? "..." : "Sync"}</Button>
          <Button variant="danger" size="sm" onClick={() => removeFeed(f.id)}>x</Button>
        </div>
      ))}
      <Button variant="ghost" onClick={addFeed}>+ Add Calendar Feed</Button>
      <div className="mt-6">
        <div className="font-bold text-base mb-3">{monthName}</div>
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (<div key={d} className="text-center text-[11px] font-semibold text-txt-secondary py-1">{d}</div>))}
          {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={"e" + i} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1; const isToday = day === today.getDate();
            return <div key={day} className={"text-center py-2 rounded-lg text-sm " + (isToday ? "bg-brand text-white font-bold" : "hover:bg-surface-soft cursor-pointer")}>{day}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
