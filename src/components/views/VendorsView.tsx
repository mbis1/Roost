// src/components/views/VendorsView.tsx
//
// Sprint F — property-scoped vendors panel. Lists active vendors for
// the current property, grouped by role. Add / edit / remove inline.
// Reads + writes via /api/vendors and /api/vendors/[id] (service-role
// server side so property_ids array operations work).

"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/Icon";
import {
  Button,
  Input,
  Select,
  FormField,
  Grid2,
  Label,
} from "@/components/ui";
import { useProperty } from "@/lib/hooks";

type Vendor = {
  id: string;
  property_ids: string[];
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  preferred_contact: string | null;
  rate_note: string | null;
  notes: string | null;
  active: boolean;
};

const ROLE_OPTIONS = [
  "cleaner",
  "handyman",
  "plumber",
  "electrician",
  "landscaper",
  "pest_control",
  "pool",
  "hvac",
  "locksmith",
  "other",
];

const CONTACT_OPTIONS = ["sms", "call", "email", "whatsapp"];

const ROLE_LABEL: Record<string, string> = {
  cleaner: "Cleaner",
  handyman: "Handyman",
  plumber: "Plumber",
  electrician: "Electrician",
  landscaper: "Landscaper",
  pest_control: "Pest control",
  pool: "Pool",
  hvac: "HVAC",
  locksmith: "Locksmith",
  other: "Other",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  cleaner: "bg-status-blue-bg text-status-blue",
  handyman: "bg-status-orange-bg text-status-orange",
  plumber: "bg-status-blue-bg text-status-blue",
  electrician: "bg-status-orange-bg text-status-orange",
  landscaper: "bg-status-green-bg text-status-green",
  pest_control: "bg-status-red-bg text-status-red",
  pool: "bg-status-blue-bg text-status-blue",
  hvac: "bg-status-orange-bg text-status-orange",
  locksmith: "bg-status-orange-bg text-status-orange",
  other: "bg-surface-soft text-txt-secondary",
};

type Draft = {
  name: string;
  role: string;
  phone: string;
  email: string;
  preferred_contact: string;
  rate_note: string;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    name: "",
    role: "cleaner",
    phone: "",
    email: "",
    preferred_contact: "sms",
    rate_note: "",
    notes: "",
  };
}

function vendorToDraft(v: Vendor): Draft {
  return {
    name: v.name,
    role: v.role,
    phone: v.phone || "",
    email: v.email || "",
    preferred_contact: v.preferred_contact || "sms",
    rate_note: v.rate_note || "",
    notes: v.notes || "",
  };
}

export function VendorsView({ propertyId }: { propertyId: string }) {
  const { data: property } = useProperty(propertyId);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const propertyName =
    property?.nickname || property?.name || "this property";

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/vendors?property_id=${encodeURIComponent(propertyId)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `Failed (${r.status})`);
      } else {
        setVendors((j.vendors || []) as Vendor[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const startAdd = () => {
    setDraft(emptyDraft());
    setAdding(true);
    setEditingId(null);
    setError(null);
  };
  const startEdit = (v: Vendor) => {
    setDraft(vendorToDraft(v));
    setEditingId(v.id);
    setAdding(false);
    setError(null);
  };
  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setError(null);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.role) {
      setError("Name and role are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (adding) {
        const r = await fetch("/api/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_ids: [propertyId],
            ...draft,
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || `Save failed (${r.status})`);
          return;
        }
      } else if (editingId) {
        const r = await fetch(`/api/vendors/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || `Save failed (${r.status})`);
          return;
        }
      }
      setAdding(false);
      setEditingId(null);
      await fetchVendors();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: Vendor) => {
    if (
      !confirm(
        `Remove ${v.name}? Existing bookings that reference them will keep history but new events will skip them.`
      )
    )
      return;
    const r = await fetch(`/api/vendors/${v.id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error || `Remove failed (${r.status})`);
      return;
    }
    await fetchVendors();
  };

  // Group by role for display.
  const byRole = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const list = byRole.get(v.role) || [];
    list.push(v);
    byRole.set(v.role, list);
  }
  const orderedRoles = ROLE_OPTIONS.filter((r) => byRole.has(r)).concat(
    Array.from(byRole.keys()).filter((r) => !ROLE_OPTIONS.includes(r))
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon name="contacts" className="text-2xl text-brand" />
          <h1 className="text-2xl font-extrabold">Vendors</h1>
          <span className="text-sm font-medium text-txt-secondary">
            · {propertyName}
          </span>
        </div>
        <Button onClick={startAdd} disabled={adding}>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="add" className="text-sm" />
            Add vendor
          </span>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-status-red/30 bg-status-red-bg/50 px-3 py-2 text-xs text-status-red font-semibold mb-3">
          ⚠ {error}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <VendorEditCard
          title="New vendor"
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onSave={save}
          onCancel={cancel}
        />
      )}

      {/* Existing vendors */}
      {loading && (
        <p className="text-txt-secondary text-sm">Loading vendors…</p>
      )}
      {!loading && vendors.length === 0 && !adding && (
        <div className="bg-white/60 backdrop-blur-xl border border-dashed border-surface-muted rounded-2xl p-8 text-center">
          <Icon
            name="contacts"
            className="text-3xl text-txt-tertiary inline-block mb-2"
          />
          <p className="text-sm text-txt-secondary mb-3">
            No vendors yet for {propertyName}. Add a cleaner so the
            booking timeline can schedule turnovers.
          </p>
          <Button variant="ghost" onClick={startAdd}>
            + Add your first vendor
          </Button>
        </div>
      )}
      {orderedRoles.map((role) => (
        <div key={role} className="mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-txt-secondary mb-2">
            {ROLE_LABEL[role] || role}
          </h2>
          <div className="space-y-2">
            {(byRole.get(role) || []).map((v) =>
              editingId === v.id ? (
                <VendorEditCard
                  key={v.id}
                  title="Edit vendor"
                  draft={draft}
                  setDraft={setDraft}
                  saving={saving}
                  onSave={save}
                  onCancel={cancel}
                />
              ) : (
                <VendorReadCard
                  key={v.id}
                  vendor={v}
                  onEdit={() => startEdit(v)}
                  onRemove={() => remove(v)}
                />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VendorReadCard({
  vendor,
  onEdit,
  onRemove,
}: {
  vendor: Vendor;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-surface-muted rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold text-txt truncate">
              {vendor.name}
            </h3>
            <span
              className={clsx(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide",
                ROLE_BADGE_CLASS[vendor.role] ||
                  "bg-surface-soft text-txt-secondary"
              )}
            >
              {ROLE_LABEL[vendor.role] || vendor.role}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-txt-secondary mt-1 flex-wrap">
            {vendor.phone && (
              <span className="inline-flex items-center gap-1">
                <Icon name="call" className="text-xs" /> {vendor.phone}
              </span>
            )}
            {vendor.email && (
              <span className="inline-flex items-center gap-1">
                <Icon name="mail" className="text-xs" /> {vendor.email}
              </span>
            )}
            {vendor.preferred_contact && (
              <span className="text-txt-tertiary capitalize">
                prefers {vendor.preferred_contact}
              </span>
            )}
            {vendor.rate_note && (
              <span className="text-txt-tertiary">{vendor.rate_note}</span>
            )}
          </div>
          {vendor.notes && (
            <p className="text-xs text-txt-secondary mt-2 leading-relaxed">
              {vendor.notes}
            </p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <span className="inline-flex items-center gap-1">
              <Icon name="edit" className="text-sm" />
              Edit
            </span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Icon name="delete" className="text-sm" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function VendorEditCard({
  title,
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  title: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const u = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
  return (
    <div className="bg-white border border-brand/40 rounded-2xl p-4 mb-3">
      <h3 className="text-base font-extrabold text-txt mb-3">{title}</h3>
      <Grid2>
        <FormField label="Name">
          <Input
            value={draft.name}
            onChange={(v) => u("name", v)}
            placeholder="e.g. Lupita Cleaner (Glenolden)"
          />
        </FormField>
        <FormField label="Role">
          <Select
            value={draft.role}
            onChange={(v) => u("role", v)}
            options={ROLE_OPTIONS}
          />
        </FormField>
        <FormField label="Phone">
          <Input
            value={draft.phone}
            onChange={(v) => u("phone", v)}
            placeholder="919-746-6408"
          />
        </FormField>
        <FormField label="Email">
          <Input value={draft.email} onChange={(v) => u("email", v)} />
        </FormField>
        <FormField label="Preferred contact">
          <Select
            value={draft.preferred_contact}
            onChange={(v) => u("preferred_contact", v)}
            options={CONTACT_OPTIONS}
          />
        </FormField>
        <FormField label="Rate note">
          <Input
            value={draft.rate_note}
            onChange={(v) => u("rate_note", v)}
            placeholder="$120 / turnover"
          />
        </FormField>
        <FormField label="Notes" span>
          <Input
            value={draft.notes}
            onChange={(v) => u("notes", v)}
            placeholder="anything to remember"
          />
        </FormField>
      </Grid2>
      <div className="flex gap-2 mt-3 justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
