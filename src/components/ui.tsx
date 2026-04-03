"use client";
import { ReactNode } from "react";
import clsx from "clsx";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("bg-white rounded-xl border border-surface-muted p-4", className)}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-extrabold mb-4">{children}</h2>;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wide mb-1 block">{children}</label>;
}

export function Input({ value, onChange, type = "text", placeholder }: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand transition-colors" />;
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}
    className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand">
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>;
}

export function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
    className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm text-txt outline-none focus:border-brand resize-y" />;
}

export function Button({ children, onClick, variant = "primary", size = "md", className }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "danger" | "ghost"; size?: "sm" | "md"; className?: string;
}) {
  const base = "font-semibold rounded-lg cursor-pointer transition-colors";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    danger: "bg-status-red-bg text-status-red hover:bg-red-100",
    ghost: "bg-transparent border border-surface-muted text-txt-secondary hover:border-txt-secondary",
  };
  return <button onClick={onClick} className={clsx(base, sizes[size], variants[variant], className)}>{children}</button>;
}

export function Badge({ children, color = "blue" }: { children: ReactNode; color?: "blue" | "green" | "red" | "orange" | "gray" }) {
  const colors = {
    blue: "bg-status-blue-bg text-status-blue", green: "bg-status-green-bg text-status-green",
    red: "bg-status-red-bg text-status-red", orange: "bg-status-orange-bg text-status-orange",
    gray: "bg-surface-soft text-txt-secondary",
  };
  return <span className={clsx("px-2 py-0.5 rounded-md text-[10px] font-semibold", colors[color])}>{children}</span>;
}

export function EmptyState({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return <div className="text-center py-12"><p className="text-txt-secondary text-sm mb-3">{message}</p>
    {action && onAction && <Button onClick={onAction} variant="ghost">{action}</Button>}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "red" | "orange" | "green" | "blue" | "gray"> = {
    urgent: "red", overdue: "red", upcoming: "blue", done: "green",
    confirmed: "green", inquiry: "orange", review: "orange", expired: "gray", cancelled: "gray",
    listed: "green", unlisted: "gray", snoozed: "orange",
  };
  return <Badge color={map[status] || "gray"}>{status}</Badge>;
}

export function Grid2({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-3">{children}</div>; }
export function Grid4({ children }: { children: ReactNode }) { return <div className="grid grid-cols-4 gap-3">{children}</div>; }
export function FormField({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return <div className={span ? "col-span-2" : ""}><Label>{label}</Label>{children}</div>;
}
export function Dollar(n: number) { return "$" + n.toFixed(2); }
export function DollarInt(n: number) { return "$" + n.toLocaleString(); }
