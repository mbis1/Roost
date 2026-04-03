"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Property, PropertyRules, ListingSettings, CalendarFeed, Message, MessageThread, Vendor, Task, UserSettings } from "@/lib/supabase";

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

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").limit(1).single();
      if (data) setSettings(data as UserSettings);
      setLoading(false);
    })();
  }, []);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    const { error } = await supabase.from("user_settings").update(updates).eq("id", settings.id);
    if (!error) setSettings({ ...settings, ...updates });
  };

  return { settings, loading, updateSettings };
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
