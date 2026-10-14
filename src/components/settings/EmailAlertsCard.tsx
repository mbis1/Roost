"use client";

// Settings → Email alerts. Who Roost watches in the inbox; a match texts
// the owner's Telegram with the email + a proposed reply.

import { useEffect, useState } from "react";
import { Card, Button, Input, TextArea, FormField } from "@/components/ui";

type Watch = {
  id: string;
  label: string;
  match_from: string;
  match_names: string;
  context_notes: string;
  active: boolean;
};

type Recent = {
  id: string;
  status: string;
  created_at: string;
  error: string | null;
  emails?: { subject: string | null; from_name: string | null } | null;
};

const blank = { label: "", match_from: "", match_names: "", context_notes: "" };

export function EmailAlertsCard() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // watch id or "new"
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/email-watches", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) {
        setLoadErr(j.hint ? `${j.error} — ${j.hint}` : j.error);
        return;
      }
      setLoadErr(null);
      setWatches(j.watches);
      setRecent(j.recent);
    } catch (e) {
      setLoadErr(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  function startEdit(w?: Watch) {
    setMsg(null);
    if (w) {
      setEditing(w.id);
      setForm({ label: w.label, match_from: w.match_from, match_names: w.match_names, context_notes: w.context_notes });
    } else {
      setEditing("new");
      setForm(blank);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const isNew = editing === "new";
    const r = await fetch(isNew ? "/api/email-watches" : `/api/email-watches/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Bad response" }));
    setBusy(false);
    if (!j.ok) return setMsg({ ok: false, text: j.error });
    setEditing(null);
    setMsg({ ok: true, text: "Saved" });
    load();
  }

  async function toggle(w: Watch) {
    await fetch(`/api/email-watches/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !w.active }),
    });
    load();
  }

  async function test(w: Watch) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/email-watches/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watch_id: w.id }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Bad response" }));
    setBusy(false);
    setMsg(
      j.ok
        ? { ok: true, text: `Sent to Telegram: "${j.email?.subject || "(no subject)"}"` }
        : { ok: false, text: j.error || "Failed" }
    );
    load();
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-bold text-sm">Email alerts</div>
        <span className="text-[10px] text-txt-tertiary">
          Telegram ping + proposed reply when a watched sender emails
        </span>
      </div>

      {loadErr && <p className="text-[11px] text-status-red mb-2">{loadErr}</p>}

      <div className="space-y-2">
        {watches.map((w) =>
          editing === w.id ? null : (
            <div key={w.id} className="rounded-lg border border-surface-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {w.label}{" "}
                    <span className={"text-[10px] font-normal " + (w.active ? "text-status-green" : "text-txt-tertiary")}>
                      {w.active ? "● On" : "○ Off"}
                    </span>
                  </div>
                  <div className="text-[11px] text-txt-secondary break-words">
                    {w.match_from ? <>From: {w.match_from}</> : <>From: any address</>}
                    {w.match_names ? <> · Names: {w.match_names}</> : null}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(w)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(w)}>{w.active ? "Turn off" : "Turn on"}</Button>
                  <Button size="sm" onClick={() => test(w)} disabled={busy}>Test</Button>
                </div>
              </div>
            </div>
          )
        )}
        {watches.length === 0 && !loadErr && (
          <p className="text-[11px] text-txt-tertiary">No one is watched yet.</p>
        )}
      </div>

      {editing ? (
        <div className="mt-3 rounded-lg border border-surface-muted p-3 space-y-2">
          <FormField label="Label (shown in the ping)">
            <Input value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="Jen Forman (Glenolden)" />
          </FormField>
          <FormField label="Email addresses or @domains (comma separated)">
            <Input value={form.match_from} onChange={(v) => setForm({ ...form, match_from: v })} placeholder="jen@example.com" />
          </FormField>
          <FormField label="Names to look for in sender, subject or body (comma separated)">
            <Input value={form.match_names} onChange={(v) => setForm({ ...form, match_names: v })} placeholder="Jen Forman, Jennifer Forman" />
          </FormField>
          <FormField label="Facts for the AI reply (optional)">
            <TextArea rows={3} value={form.context_notes} onChange={(v) => setForm({ ...form, context_notes: v })} placeholder="Lease dates, pets, anything the reply should know" />
          </FormField>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => startEdit()}>+ Watch someone</Button>
        </div>
      )}

      {msg && (
        <p className={"text-[11px] mt-2 " + (msg.ok ? "text-status-green" : "text-status-red")}>{msg.text}</p>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-txt-secondary mb-1">Recent alerts</div>
          <ul className="space-y-1">
            {recent.map((a) => (
              <li key={a.id} className="text-[11px] text-txt-secondary flex justify-between gap-2">
                <span className="truncate">{a.emails?.subject || "(no subject)"}</span>
                <span className={"shrink-0 " + (a.status === "failed" ? "text-status-red" : "")}>
                  {a.status} ·{" "}
                  {new Date(a.created_at).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  ET
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
