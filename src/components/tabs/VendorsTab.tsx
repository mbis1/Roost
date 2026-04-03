"use client";

import { useState } from "react";
import { useVendors, useProperties, insertRow, updateRow, deleteRow } from "@/lib/hooks";
import { Card, SectionTitle, Badge, Button, Input, Select, Label, FormField, Grid2 } from "@/components/ui";

export function VendorsTab() {
  const { data: vendors, refetch } = useVendors();
  const { data: properties } = useProperties();
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");

  const roles = ["All", "Cleaner", "Handyman", "Plumber", "Electrician", "Locksmith", "HVAC", "Other"];
  const filtered = filter === "All" ? vendors : vendors.filter((v) => v.role === filter);

  const addVendor = async () => {
    const result = await insertRow("vendors", { name: "New Vendor", role: "Cleaner", phone: "", email: "", rate: "", property_ids: [], rating: 3, notes: "" });
    if (result) { refetch(); setEditId(result.id); }
  };
  const save = async (id: string, updates: Record<string, unknown>) => { await updateRow("vendors", id, updates); refetch(); setEditId(null); };
  const remove = async (id: string) => { await deleteRow("vendors", id); refetch(); setEditId(null); };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4"><SectionTitle>Vendors & Contacts</SectionTitle><Button onClick={addVendor}>+ Add Vendor</Button></div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {roles.map((r) => (<button key={r} onClick={() => setFilter(r)} className={"px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors " + (filter === r ? "border-brand bg-brand/10 text-brand" : "border-surface-muted text-txt-secondary")}>{r}</button>))}
      </div>
      {filtered.map((v) => (
        <Card key={v.id} className="mb-2 cursor-pointer">
          {editId === v.id ? (
            <VendorEditForm vendor={v} properties={properties} onSave={(u) => save(v.id, u)} onDelete={() => remove(v.id)} onCancel={() => setEditId(null)} />
          ) : (
            <div onClick={() => setEditId(v.id)}>
              <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="font-bold text-sm">{v.name}</span><Badge color="blue">{v.role}</Badge></div><span className="text-xs text-txt-secondary">{v.rate}</span></div>
              <div className="text-xs text-txt-secondary mt-1">{[v.phone, v.email, v.notes].filter(Boolean).join(" . ")}</div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function VendorEditForm({ vendor, properties, onSave, onDelete, onCancel }: any) {
  const [form, setForm] = useState({ ...vendor });
  const u = (k: string, v: unknown) => setForm((p: any) => ({ ...p, [k]: v }));
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Grid2>
        <FormField label="Name"><Input value={form.name} onChange={(v) => u("name", v)} /></FormField>
        <FormField label="Role"><Select value={form.role} onChange={(v) => u("role", v)} options={["Cleaner", "Handyman", "Plumber", "Electrician", "Locksmith", "HVAC", "Other"]} /></FormField>
        <FormField label="Phone"><Input value={form.phone} onChange={(v) => u("phone", v)} /></FormField>
        <FormField label="Email"><Input value={form.email} onChange={(v) => u("email", v)} /></FormField>
        <FormField label="Rate"><Input value={form.rate} onChange={(v) => u("rate", v)} /></FormField>
        <FormField label="Rating (1-5)"><Input type="number" value={form.rating} onChange={(v) => u("rating", Number(v) || 0)} /></FormField>
        <FormField label="Notes" span><Input value={form.notes} onChange={(v) => u("notes", v)} /></FormField>
      </Grid2>
      <div className="flex gap-2 mt-3"><Button onClick={() => onSave(form)}>Save</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant="danger" onClick={onDelete}>Delete</Button></div>
    </div>
  );
}
