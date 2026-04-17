"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Label, Input, Select, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";

const PROPERTY_TYPES = ["Apartment", "House", "Condo", "Townhouse", "Cabin", "Other"];

export function AddPropertyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (propertyId: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    bedrooms: 1,
    bathrooms: 1,
    max_guests: 2,
    property_type: "House",
    primary_photo_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      setError("Name and address are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("properties")
      .insert({
        name: form.name.trim(),
        address: form.address.trim(),
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        max_guests: form.max_guests,
        property_type: form.property_type,
        primary_photo_url: form.primary_photo_url.trim(),
        status: "listed",
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message || "Failed to create property.");
      return;
    }
    onCreated(data.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-muted">
          <div className="flex items-center gap-2">
            <Icon name="add_home" className="text-2xl text-brand" filled />
            <h3 className="text-lg font-extrabold">Add Property</h3>
          </div>
          <button onClick={onClose} className="text-txt-tertiary hover:text-txt cursor-pointer">
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <Label>Property Name</Label>
            <Input
              value={form.name}
              onChange={(v) => u("name", v)}
              placeholder="e.g. Glenolden Court"
            />
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(v) => u("address", v)}
              placeholder="123 Main St, City, State 12345"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Bedrooms</Label>
              <Input
                type="number"
                value={form.bedrooms}
                onChange={(v) => u("bedrooms", parseInt(v) || 0)}
              />
            </div>
            <div>
              <Label>Bathrooms</Label>
              <Input
                type="number"
                value={form.bathrooms}
                onChange={(v) => u("bathrooms", parseFloat(v) || 0)}
              />
            </div>
            <div>
              <Label>Max Guests</Label>
              <Input
                type="number"
                value={form.max_guests}
                onChange={(v) => u("max_guests", parseInt(v) || 0)}
              />
            </div>
          </div>
          <div>
            <Label>Property Type</Label>
            <Select
              value={form.property_type}
              onChange={(v) => u("property_type", v)}
              options={PROPERTY_TYPES}
            />
          </div>
          <div>
            <Label>Photo URL (optional)</Label>
            <Input
              value={form.primary_photo_url}
              onChange={(v) => u("primary_photo_url", v)}
              placeholder="https://… or leave blank"
            />
            <p className="text-[11px] text-txt-tertiary mt-1">
              Paste an image URL for now. Upload support comes later.
            </p>
          </div>

          {error && (
            <div className="text-xs text-status-red bg-status-red-bg rounded-md px-2 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-surface-muted">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{saving ? "Saving…" : "Create Property"}</Button>
        </div>
      </div>
    </div>
  );
}
