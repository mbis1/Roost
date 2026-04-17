"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Icon } from "@/components/Icon";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
        },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        // Email confirmation is disabled — we have a session immediately.
        router.push("/");
        router.refresh();
      } else {
        // Email confirmation is required by the Supabase project.
        setInfo(
          "Check your email for a confirmation link, then come back here to sign in."
        );
        setMode("signin");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-soft via-white to-brand/5 font-sans px-4">
      <div className="w-full max-w-md bg-white border border-surface-muted rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-surface-muted flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand text-white font-extrabold flex items-center justify-center">
            R
          </div>
          <div>
            <div className="font-extrabold text-lg">ROOST</div>
            <div className="text-[11px] text-txt-tertiary uppercase tracking-wide">
              AI Property Manager
            </div>
          </div>
        </div>

        <div className="px-6 pt-5 flex gap-2">
          <TabPill
            active={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
            }}
          >
            Sign in
          </TabPill>
          <TabPill
            active={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
            }}
          >
            Create account
          </TabPill>
        </div>

        <form onSubmit={onSubmit} className="px-6 pb-6 pt-4 space-y-3">
          {mode === "signup" && (
            <Field
              label="Name"
              value={fullName}
              onChange={setFullName}
              placeholder="Your full name"
              autoComplete="name"
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />

          {error && (
            <div className="flex items-start gap-2 bg-status-red-bg text-status-red text-sm rounded-lg px-3 py-2">
              <Icon name="error" className="text-base flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 bg-status-blue-bg text-status-blue text-sm rounded-lg px-3 py-2">
              <Icon name="info" className="text-base flex-shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand text-white rounded-lg font-semibold text-sm hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>

          <p className="text-[11px] text-txt-tertiary text-center pt-1">
            By continuing you agree that Roost will store your data in its
            Supabase project.
          </p>
        </form>
      </div>
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 py-2 rounded-full text-sm font-semibold border transition-colors cursor-pointer " +
        (active
          ? "border-brand bg-brand/10 text-brand"
          : "border-surface-muted text-txt-secondary hover:border-txt-secondary")
      }
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wide mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full px-3 py-2.5 bg-surface-soft border border-surface-muted rounded-lg text-sm outline-none focus:border-brand transition-colors"
      />
    </div>
  );
}
