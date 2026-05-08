// src/lib/categorize-tags.ts
//
// Sprint C.1 — canonical tag taxonomy. Single source of truth for both
// the rule pre-filter, the AI fallback, and the Inbox UI filter chips.

export const PRIMARY_TAGS = [
  "guest_message",
  "booking",
  "payout",
  "review",
  "expense",
  "utility",
  "vendor",
  "mortgage",
  "legal",
  "hoa",
  "platform_notice",
  "personal",
  "spam",
  "other",
] as const;

export type PrimaryTag = (typeof PRIMARY_TAGS)[number];

/** Built-in secondary tags. property:<uuid> is also valid (handled separately). */
export const SECONDARY_TAGS = [
  "urgent",
  "needs_action",
  "maintenance",
  "paid",
  "unpaid",
  "new_booking",
  "cancellation",
  "modification",
] as const;

export type SecondaryTag = (typeof SECONDARY_TAGS)[number];

export function isValidPrimaryTag(t: string): t is PrimaryTag {
  return (PRIMARY_TAGS as readonly string[]).includes(t);
}

/** True if t is a known built-in secondary tag OR a property:<uuid> reference. */
export function isValidSecondaryTag(t: string): boolean {
  if ((SECONDARY_TAGS as readonly string[]).includes(t)) return true;
  if (t.startsWith("property:")) {
    const id = t.slice("property:".length);
    // Loose UUID check — don't want to reject otherwise-valid ids.
    return id.length >= 8;
  }
  return false;
}

/** Return only the entries from `tags` that are valid; drop anything else. */
export function filterValidSecondaryTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const trimmed = String(t).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (isValidSecondaryTag(trimmed)) {
      out.push(trimmed);
      seen.add(trimmed);
    }
  }
  return out;
}
