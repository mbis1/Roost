// src/lib/categorize.ts
//
// Sprint C.1 — orchestrator. Try the cheap rule pre-filter first; fall
// back to the AI categorizer for whatever's left; final fallback is
// "other" so every email still gets tagged.

import { categorizeByRules } from "./categorize-rules";
import { categorizeByAI } from "./categorize-ai";
import { isValidPrimaryTag, filterValidSecondaryTags } from "./categorize-tags";
import type { Category, CategorizableEmail } from "./categorize-rules";

export type { Category, CategorizableEmail };

export async function categorizeEmail(
  email: CategorizableEmail
): Promise<Category> {
  const ruleResult = categorizeByRules(email);
  if (ruleResult && isValidPrimaryTag(ruleResult.primary_tag)) {
    return {
      ...ruleResult,
      secondary_tags: filterValidSecondaryTags(ruleResult.secondary_tags),
    };
  }

  const aiResult = await categorizeByAI(email);
  if (aiResult) return aiResult;

  return {
    primary_tag: "other",
    secondary_tags: [],
    source: "rule",
    rule_id: "fallthrough",
  };
}
