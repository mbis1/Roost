"use client";

import { useState } from "react";
import { useTasks, useProperties, insertRow, updateRow, deleteRow } from "@/lib/hooks";
import { Card, SectionTitle, StatusBadge, Badge, Button, Input, Select, Label, FormField, Grid2 } from "@/components/ui";

export function TasksTab({ propertyId }: { propertyId?: string }) {
  const { data: tasks, refetch } = useTasks(propertyId);
  const { data: properties } = useProperties();
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const sorted = [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const pri: Record<string, number> = { overdue: 0, urgent: 1, upcoming: 2, done: 3 };
    return (pri[a.status] || 2) - (pri[b.status] || 2);
  });

  const filtered = filter === "all" ? sorted : filter === "active" ? sorted.filter((t) => t.status !== "done") : sorted.filter((t) => t.status === filter);

  const addTask = async () => {
    const result = await insertRow("tasks", { task: "New task", type: "Other", due_date: new Date().toISOString().split("T")[0], status: "upcoming", property_id: propertyId || null, assigned_to: "", cost: 0, notes: "", recurrence: "one-time" });
    if (result) { refetch(); setEditId(result.id); }
  };

  const markDone = async (id: string) => { await updateRow("tasks", id, { status: "done", last_completed_at: new Date().toISOString() }); refetch(); };
  const remove = async (id: string) => { await deleteRow("tasks", id); refetch(); setEditId(null); };
  const save = async (id: string, updates: Record<string, unknown>) => { await updateRow("tasks", id, updates); refetch(); setEditId(null); };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <SectionTitle>{propertyId ? "Tasks" : "All Tasks"}</SectionTitle>
        <Button onClick={addTask}>+ Add Task</Button>
      </div>
      <div className="flex gap-1.5 mb-4">
        {["all", "active", "urgent", "overdue", "upcoming", "done"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={"px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors " + (filter === f ? "border-brand bg-brand/10 text-brand" : "border-surface-muted text-txt-secondary")}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>
      {filtered.map((t) => (
        <div key={t.id} className={"flex items-center justify-between p-3 rounded-xl mb-1.5 border " + (t.status === "overdue" ? "bg-status-red-bg border-red-200" : t.status === "urgent" ? "bg-status-orange-bg border-orange-200" : "bg-white border-surface-muted")}>
          {editId === t.id ? (
            <TaskEditForm task={t} properties={properties} onSave={(u) => save(t.id, u)} onDelete={() => remove(t.id)} onCancel={() => setEditId(null)} />
          ) : (
            <>
              <div className="cursor-pointer flex-1" onClick={() => setEditId(t.id)}>
                <div className={"font-semibold text-sm " + (t.status === "done" ? "line-through text-txt-secondary" : "")}>{t.task}</div>
                <div className="text-xs text-txt-secondary mt-0.5">{[t.due_date, t.assigned_to, t.type, t.notes].filter(Boolean).join(" . ")}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                {t.status !== "done" && <button onClick={() => markDone(t.id)} className="w-6 h-6 rounded-full border-2 border-surface-muted bg-white text-xs hover:border-brand transition-colors cursor-pointer">v</button>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskEditForm({ task, properties, onSave, onDelete, onCancel }: { task: any; properties: any[]; onSave: (u: Record<string, unknown>) => void; onDelete: () => void; onCancel: () => void; }) {
  const [form, setForm] = useState({ ...task });
  const u = (k: string, v: unknown) => setForm((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="w-full" onClick={(e) => e.stopPropagation()}>
      <Grid2>
        <FormField label="Task" span><Input value={form.task} onChange={(v) => u("task", v)} /></FormField>
        <FormField label="Type"><Select value={form.type} onChange={(v) => u("type", v)} options={["Other", "Cleaning", "Maintenance", "Security", "Message", "Review", "Restock", "Inspection"]} /></FormField>
        <FormField label="Status"><Select value={form.status} onChange={(v) => u("status", v)} options={["urgent", "overdue", "upcoming", "done"]} /></FormField>
        <FormField label="Due Date"><Input type="date" value={form.due_date} onChange={(v) => u("due_date", v)} /></FormField>
        <FormField label="Assigned To"><Input value={form.assigned_to} onChange={(v) => u("assigned_to", v)} /></FormField>
        <FormField label="Recurrence"><Select value={form.recurrence} onChange={(v) => u("recurrence", v)} options={["one-time", "daily", "weekly", "monthly", "quarterly", "semi-annual", "annual"]} /></FormField>
        <FormField label="Cost"><Input type="number" value={form.cost} onChange={(v) => u("cost", Number(v) || 0)} /></FormField>
        <FormField label="Notes" span><Input value={form.notes} onChange={(v) => u("notes", v)} /></FormField>
      </Grid2>
      <div className="flex gap-2 mt-3"><Button onClick={() => onSave(form)}>Save</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant="danger" onClick={onDelete}>Delete</Button></div>
    </div>
  );
}
