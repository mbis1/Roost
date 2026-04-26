"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Property, PropertyRules, PropertyDetails, ListingSettings, CalendarFeed, Message, MessageThread, Vendor, Task, UserSettings, Email } from "@/lib/supabase";

function useSupabaseQuery<T>(table: string, filter?: { column: string; value: string }) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from(table).select("*");
    if (filter) query = query.eq(filter.column, filter.value);
    const { data: result, error } = await query;
    if (!error && result) setData(result as T[]);
    setLoading(false);
  }, [table, filter?.column, filter?.value]);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, refetch, setData };
}

export function useProperties() {
  return useSupabaseQuery<Property>("properties");
}

export function useProperty(propertyId: string | null | undefined) {
  const [data, setData] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!propertyId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: row, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();
    if (!error && row) setData(row as Property);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}

/**
 * Reads all property_details rows for a given property and returns them as
 * an object keyed by section name. Each section's jsonb blob is returned
 * as-is. Upsert via `save(section, data)`.
 */
export function usePropertyDetails(propertyId: string | null | undefined) {
  const [rows, setRows] = useState<PropertyDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!propertyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("property_details")
      .select("*")
      .eq("property_id", propertyId);
    if (!error && data) setRows(data as PropertyDetails[]);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const bySection = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const r of rows) map[r.section] = r.data || {};
    return map;
  }, [rows]);

  const save = useCallback(
    async (section: string, data: Record<string, unknown>) => {
      if (!propertyId) return;
      const { error } = await supabase
        .from("property_details")
        .upsert(
          {
            property_id: propertyId,
            section,
            data,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "property_id,section" }
        );
      if (error) {
        console.error("save property_details error:", error);
      }
      await refetch();

      // Sprint B.2 — trigger workflow recompile when a workflow-participating
      // card is saved. Fire-and-forget; recompile failure must never block UX.
      // The endpoint runs on the server with the service-role key.
      if (
        section === "access_and_locks" ||
        section === "arrival_flow" ||
        section === "departure_flow"
      ) {
        fetch(`/api/property/${propertyId}/recompile-workflow`, {
          method: "POST",
        }).catch((err) =>
          console.error("workflow recompile trigger failed:", err)
        );
      }
    },
    [propertyId, refetch]
  );

  return { rows, bySection, loading, refetch, save };
}

export function usePropertyRules(propertyId: string) {
  return useSupabaseQuery<PropertyRules>("property_rules", { column: "property_id", value: propertyId });
}

export function useListingSettings(propertyId: string) {
  return useSupabaseQuery<ListingSettings>("listing_settings", { column: "property_id", value: propertyId });
}

export function useCalendarFeeds(propertyId: string) {
  return useSupabaseQuery<CalendarFeed>("calendar_feeds", { column: "property_id", value: propertyId });
}

export function useMessages(propertyId?: string) {
  const filter = propertyId ? { column: "property_id", value: propertyId } : undefined;
  return useSupabaseQuery<Message>("messages", filter);
}

export function useMessageThreads(messageId: string) {
  return useSupabaseQuery<MessageThread>("message_threads", { column: "message_id", value: messageId });
}

export function useVendors() {
  return useSupabaseQuery<Vendor>("vendors");
}

export function useTasks(propertyId?: string) {
  const filter = propertyId ? { column: "property_id", value: propertyId } : undefined;
  return useSupabaseQuery<Task>("tasks", filter);
}

export function useEmails(options?: {
  primaryTag?: string;
  propertyId?: string | null;
  orderAsc?: boolean;
}) {
  const [data, setData] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("emails").select("*");
    if (options?.primaryTag) q = q.eq("primary_tag", options.primaryTag);
    if (options?.propertyId) q = q.eq("property_id", options.propertyId);
    q = q.order("received_at", { ascending: options?.orderAsc ?? false });
    const { data: result, error } = await q;
    if (!error && result) setData(result as Email[]);
    setLoading(false);
  }, [options?.primaryTag, options?.propertyId, options?.orderAsc]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch, setData };
}

export async function assignEmailToProperty(
  emailId: string,
  propertyId: string | null
) {
  const { error } = await supabase
    .from("emails")
    .update({ property_id: propertyId })
    .eq("id", emailId);
  if (error) console.error("assignEmailToProperty error:", error);
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1. Try to read an existing row.
        const { data: existing, error: readErr } = await supabase
          .from("user_settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (readErr) {
          setError(readErr.message);
          return;
        }

        if (existing) {
          setSettings(existing as UserSettings);
          return;
        }

        // 2. No row yet → create one for the current auth user.
        // Schema has user_id UNIQUE references auth.users; everything else
        // has defaults, so an insert with just user_id is enough.
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
          setError(
            "You're not signed in — can't create a settings row. Try signing out and back in."
          );
          return;
        }

        const { data: created, error: insertErr } = await supabase
          .from("user_settings")
          .insert({ user_id: userId })
          .select()
          .single();

        if (insertErr) {
          setError(`Couldn't create settings row: ${insertErr.message}`);
          return;
        }
        setSettings(created as UserSettings);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    const { error: updErr } = await supabase
      .from("user_settings")
      .update(updates)
      .eq("id", settings.id);
    if (updErr) {
      console.error("user_settings update error:", updErr);
      setError(updErr.message);
      return;
    }
    setSettings({ ...settings, ...updates });
  };

  return { settings, loading, error, updateSettings };
}

export async function insertRow(table: string, data: Record<string, unknown>) {
  const { data: result, error } = await supabase.from(table).insert(data).select().single();
  if (error) console.error("Insert error:", error);
  return result;
}

export async function updateRow(table: string, id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(data).eq("id", id);
  if (error) console.error("Update error:", error);
}

export async function deleteRow(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error("Delete error:", error);
}
