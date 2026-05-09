"use client";

import type { Property } from "@/lib/supabase";
import { PropertyCalendarView } from "@/components/views/PropertyCalendarView";

/**
 * Sprint E — Calendar tab on the property nav. Just hosts the
 * PropertyCalendarView (the actual month grid + drawer + price editor).
 * Feed configuration lives in the Business tab's "Listings & Calendar
 * Sync" card.
 */
export function CalendarTab({ property }: { property: Property }) {
  return (
    <PropertyCalendarView
      propertyId={property.id}
      propertyName={property.nickname || property.name}
    />
  );
}
