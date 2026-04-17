"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Exposes the current authenticated user plus loading / sign-out helpers.
 * Listens to Supabase auth state changes so the UI updates when a user
 * signs in or out from another tab.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return { user, loading, signOut };
}

/**
 * Extract a friendly display name from a Supabase user. Prefers full_name
 * metadata, then falls back to the local-part of the email.
 */
export function displayName(user: User | null): string {
  if (!user) return "You";
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
  if (fullName.trim()) return fullName.trim();
  const email = user.email || "";
  if (!email) return "You";
  return email.split("@")[0].replace(/[._]/g, " ");
}
