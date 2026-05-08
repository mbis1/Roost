// src/lib/categorize-rules.ts
//
// Sprint C.1 — cheap, deterministic rule-based pre-filter for inbound
// emails. Catches the obvious 70-80% of cases without burning an AI
// call. Returns null when nothing matches; the orchestrator
// (categorize.ts) then falls through to categorize-ai.ts.
//
// Tag taxonomy: see Sprint C.1 spec / categorize.ts validation.

export type Category = {
  primary_tag: string;
  secondary_tags: string[];
  source: "rule" | "ai";
  rule_id?: string;
  ai_summary?: string;
};

export type CategorizableEmail = {
  from_addr: string;
  subject: string;
  body_text: string;
};

/**
 * Substrings that mean "this is about HER listing" (the Glenolden condo).
 * Used to disambiguate Airbnb/VRBO emails that could be about her hosting
 * vs her own travel. If the body or subject mentions any of these,
 * treat as host context.
 */
const HER_LISTING_KEYWORDS = [
  "Discover Your Home Away from Home",
  "3B/2B Condo",
  "Glenolden",
];

function mentionsHerListing(text: string): boolean {
  const lower = text.toLowerCase();
  return HER_LISTING_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

export function categorizeByRules(email: CategorizableEmail): Category | null {
  const from = email.from_addr.toLowerCase();
  const subject = email.subject || "";
  const body = email.body_text || "";
  const subjectLower = subject.toLowerCase();
  const fullText = subject + " " + body;

  // ── PERSONAL: Mom traveling on Airbnb/VRBO ─────────────────────────
  // Sent from Airbnb/VRBO/Expedia but about HER trips, not her listing.
  if (
    (from.includes("airbnb.com") ||
      from.includes("vrbo.com") ||
      from.includes("expediagroup.com")) &&
    !mentionsHerListing(fullText)
  ) {
    if (/your\s+(trip|reservation|payment|receipt|stay)/i.test(subjectLower)) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_traveler_subject",
      };
    }
    if (/^confirmed:\s+your/i.test(subject)) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_confirmation",
      };
    }
    if (/your\s+(secure|confirmation)\s+code/i.test(subjectLower)) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_login_code",
      };
    }
    if (
      /^reservation\s+confirmed\s+for\s+[a-z]/i.test(subject) &&
      !/arrives/i.test(subject)
    ) {
      // "Reservation confirmed for Kraków" but NOT "...Jane arrives"
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_destination_booking",
      };
    }
    if (/airbnb\s+reservation\s+canceled/i.test(subjectLower)) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_cancellation",
      };
    }
  }

  // ── HOST: Payouts to mom ───────────────────────────────────────────
  if (
    /we sent a payout|payout.*was sent/i.test(subjectLower) &&
    from.includes("airbnb.com")
  ) {
    return {
      primary_tag: "payout",
      secondary_tags: [],
      source: "rule",
      rule_id: "host_payout",
    };
  }

  // ── HOST: Bookings on her listing ──────────────────────────────────
  if (from.includes("airbnb.com") || from.includes("vrbo.com")) {
    if (/reservation confirmed.*arrives/i.test(subject)) {
      return {
        primary_tag: "booking",
        secondary_tags: ["new_booking"],
        source: "rule",
        rule_id: "host_booking_confirmed",
      };
    }
    if (/^pending:\s+reservation\s+request/i.test(subject)) {
      return {
        primary_tag: "booking",
        secondary_tags: ["new_booking", "needs_action"],
        source: "rule",
        rule_id: "host_booking_request",
      };
    }
    if (/^inquiry\s+for/i.test(subject)) {
      return {
        primary_tag: "guest_message",
        secondary_tags: ["needs_action"],
        source: "rule",
        rule_id: "host_inquiry",
      };
    }
    if (
      /canceled:\s+reservation/i.test(subject) &&
      mentionsHerListing(fullText)
    ) {
      return {
        primary_tag: "booking",
        secondary_tags: ["cancellation", "urgent"],
        source: "rule",
        rule_id: "host_cancellation",
      };
    }
    if (
      /wrote you a review|left a.*star review|wants to change their reservation/i.test(
        subjectLower
      )
    ) {
      return {
        primary_tag: "review",
        secondary_tags: [],
        source: "rule",
        rule_id: "host_review",
      };
    }
    if (/write a review for/i.test(subjectLower)) {
      return {
        primary_tag: "review",
        secondary_tags: ["needs_action"],
        source: "rule",
        rule_id: "host_review_prompt",
      };
    }
  }

  // ── HOST: Property manager (Alotta Properties) ────────────────────
  if (from.includes("alottaproperties")) {
    if (/work order|maintenance|wo #/i.test(subject)) {
      return {
        primary_tag: "vendor",
        secondary_tags: ["maintenance"],
        source: "rule",
        rule_id: "alotta_work_order",
      };
    }
    if (/owner statement/i.test(subjectLower)) {
      return {
        primary_tag: "vendor",
        secondary_tags: [],
        source: "rule",
        rule_id: "alotta_owner_statement",
      };
    }
    if (/payment request|invoice/i.test(subjectLower)) {
      return {
        primary_tag: "expense",
        secondary_tags: ["unpaid", "needs_action"],
        source: "rule",
        rule_id: "alotta_invoice",
      };
    }
    if (/lease|renewal|tenant/i.test(subjectLower)) {
      return {
        primary_tag: "vendor",
        secondary_tags: [],
        source: "rule",
        rule_id: "alotta_tenant",
      };
    }
    return {
      primary_tag: "vendor",
      secondary_tags: [],
      source: "rule",
      rule_id: "alotta_default",
    };
  }

  // ── HOA (WM Douglas / Chesapeake Pointe / CincSystems) ────────────
  if (from.includes("wmdouglas") || from.includes("cincsystems")) {
    if (/violation/i.test(subjectLower)) {
      return {
        primary_tag: "hoa",
        secondary_tags: ["needs_action", "urgent"],
        source: "rule",
        rule_id: "hoa_violation",
      };
    }
    if (/recurring payment paid/i.test(subjectLower)) {
      return {
        primary_tag: "hoa",
        secondary_tags: ["paid"],
        source: "rule",
        rule_id: "hoa_payment_paid",
      };
    }
    if (/recurring payment for|association payment/i.test(subjectLower)) {
      return {
        primary_tag: "hoa",
        secondary_tags: ["paid"],
        source: "rule",
        rule_id: "hoa_payment",
      };
    }
    return {
      primary_tag: "hoa",
      secondary_tags: [],
      source: "rule",
      rule_id: "hoa_default",
    };
  }

  // ── Utilities ──────────────────────────────────────────────────────
  if (from.includes("dukeenergy") || from.includes("duke-energyalert")) {
    if (/thank you for your payment/i.test(subjectLower)) {
      return {
        primary_tag: "utility",
        secondary_tags: ["paid"],
        source: "rule",
        rule_id: "duke_paid",
      };
    }
    if (/statement is ready|usage alert/i.test(subjectLower)) {
      return {
        primary_tag: "utility",
        secondary_tags: [],
        source: "rule",
        rule_id: "duke_statement",
      };
    }
    return {
      primary_tag: "utility",
      secondary_tags: [],
      source: "rule",
      rule_id: "duke_default",
    };
  }
  if (
    from.includes("psncenergy") ||
    from.includes("dominion") ||
    from.includes("enbridge")
  ) {
    return {
      primary_tag: "utility",
      secondary_tags: [],
      source: "rule",
      rule_id: "gas_utility",
    };
  }
  if (from.includes("spectrumemails") || from.includes("exchange.spectrum")) {
    return {
      primary_tag: "utility",
      secondary_tags: [],
      source: "rule",
      rule_id: "internet_spectrum",
    };
  }

  // ── Mortgage servicers ─────────────────────────────────────────────
  if (
    from.includes("mylakeviewloan") ||
    from.includes("lakeview.com") ||
    from.includes("mrcooper") ||
    from.includes("regionsmortgage") ||
    from.includes("flagstar") ||
    from.includes("mortgagefamily") ||
    from.includes("valon")
  ) {
    if (/we've received your payment/i.test(subjectLower)) {
      return {
        primary_tag: "mortgage",
        secondary_tags: ["paid"],
        source: "rule",
        rule_id: "mortgage_paid",
      };
    }
    return {
      primary_tag: "mortgage",
      secondary_tags: [],
      source: "rule",
      rule_id: "mortgage_default",
    };
  }

  // ── Legal / LLC filings ────────────────────────────────────────────
  if (
    from.includes("ncfilingcenter") ||
    from.includes("myfilingservices") ||
    from.includes("sosnc.gov") ||
    from.includes("annualnotice")
  ) {
    return {
      primary_tag: "legal",
      secondary_tags: ["needs_action"],
      source: "rule",
      rule_id: "llc_filing",
    };
  }

  // ── Banking / credit cards: usually personal noise ────────────────
  if (
    from.includes("citi.com") ||
    from.includes("chase.com") ||
    from.includes("nbkc.com") ||
    from.includes("capitalone.com")
  ) {
    if (
      /statement is now available|estatement is ready|annual account summary/i.test(
        subjectLower
      )
    ) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "bank_statement",
      };
    }
    if (/payment confirmation/i.test(subjectLower)) {
      return {
        primary_tag: "personal",
        secondary_tags: ["paid"],
        source: "rule",
        rule_id: "bank_payment",
      };
    }
    if (
      /bonus points|earn.*bonus|invitation to earn|new chase|sign-up bonus/i.test(
        subjectLower
      )
    ) {
      return {
        primary_tag: "spam",
        secondary_tags: [],
        source: "rule",
        rule_id: "bank_promo",
      };
    }
    return {
      primary_tag: "personal",
      secondary_tags: [],
      source: "rule",
      rule_id: "bank_default",
    };
  }

  // ── Yahoo / Google / YouTube / etc — almost always personal ───────
  if (
    from.includes("youtube.com") ||
    from.includes("googleplay") ||
    from.includes("google.com") ||
    from.includes("googlepay") ||
    from.includes("comms.yahoo.net") ||
    from.includes("@cc.yahoo.com") ||
    from.includes("location-history") ||
    from.includes("googlehome")
  ) {
    if (/order receipt|order/i.test(subjectLower)) {
      return {
        primary_tag: "personal",
        secondary_tags: [],
        source: "rule",
        rule_id: "personal_purchase",
      };
    }
    return {
      primary_tag: "spam",
      secondary_tags: [],
      source: "rule",
      rule_id: "tech_marketing",
    };
  }

  // ── Random subscriptions / promos ─────────────────────────────────
  if (
    from.includes("bedbathandbeyond") ||
    from.includes("loyalty@") ||
    from.includes("medallia.com") ||
    from.includes("surveymonkey") ||
    from.includes("americanairlines") ||
    from.includes("aa.com") ||
    from.includes("clientexperience") ||
    from.includes("info.dukeenergy")
  ) {
    return {
      primary_tag: "spam",
      secondary_tags: [],
      source: "rule",
      rule_id: "marketing",
    };
  }

  // ── Zillow lease inquiries ─────────────────────────────────────────
  if (from.includes("convo.zillow.com")) {
    return {
      primary_tag: "guest_message",
      secondary_tags: ["needs_action"],
      source: "rule",
      rule_id: "zillow_inquiry",
    };
  }

  // ── Yahoo account notices ──────────────────────────────────────────
  if (from.includes("@cc.yahoo.com") || from.includes("yahoo account")) {
    return {
      primary_tag: "personal",
      secondary_tags: [],
      source: "rule",
      rule_id: "yahoo_account",
    };
  }

  // No rule matched — return null, AI categorizer will handle.
  return null;
}
