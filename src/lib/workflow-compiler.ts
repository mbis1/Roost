// src/lib/workflow-compiler.ts
//
// Sprint B.2 — Workflow Compiler.
//
// Pure-ish, deterministic transformation:
//   property_details rows  →  WorkflowDiagram (11 ordered steps)
//
// No AI. No execution. No variable resolution.
//
// Field-name note: the spec for B.2 used a few field names that don't match
// what Sprint B.1's cards actually save (e.g. spec said `welcome_message_enabled`,
// B.1 saves `welcome_enabled`). This compiler reads the *actual* B.1 names so
// the diagram reflects real settings instead of silently defaulting.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  WorkflowAction,
  WorkflowDiagram,
  WorkflowStep,
} from "./workflow-types";

/* ------------------------------------------------------------------ */
/* Internal narrow types for the settings shapes the compiler reads   */
/* (matches what Sprint B.1's cards persist in property_details.data) */
/* ------------------------------------------------------------------ */

type AccessAndLocks = {
  lock_type?: "yale_smart_lock" | "other";
  code_method?: "phone_last_4" | "custom_static";
  custom_code?: string;
  code_lifecycle?: "reset_per_booking" | "never_reset";
  execution_mode?: "semi_auto" | "manual" | "fully_auto";
  spare_key_location?: string;
};

type ArrivalFlow = {
  checkin_time?: string;
  checkin_window_end?: "flexible" | "18:00" | "20:00" | "22:00";
  welcome_enabled?: boolean;
  welcome_template?: string;
  pre_arrival_enabled?: boolean;
  pre_arrival_template?: string;
  parking_instructions?: string;
};

type DepartureFlow = {
  checkout_time?: string;
  checkout_instructions?: string;
  checkout_reminder_enabled?: boolean;
  checkout_reminder_template?: string;
  cleaner_notify_enabled?: boolean;
  cleaner_contact?: string;
  cleaner_lead_time?: "24" | "48" | "72";
  cleaner_message_template?: string;
};

type SettingsBundle = {
  access_and_locks?: AccessAndLocks;
  arrival_flow?: ArrivalFlow;
  departure_flow?: DepartureFlow;
  // Other sections exist (wifi_and_tech, house_manual, etc.) but the compiler
  // only reads the three workflow-participating cards today.
  [section: string]: Record<string, unknown> | undefined;
};

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Reads all workflow-participating settings for a property and returns
 * a compiled WorkflowDiagram. Deterministic — same inputs always produce
 * the same output. No AI, no execution, no persistence.
 */
export async function compileWorkflow(
  propertyId: string
): Promise<WorkflowDiagram> {
  // 1. Fetch property + relevant property_details rows
  const { data: property, error: pErr } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();

  if (pErr) throw new Error(`Property fetch failed: ${pErr.message}`);
  if (!property) throw new Error(`Property ${propertyId} not found`);

  const { data: details, error: dErr } = await supabaseAdmin
    .from("property_details")
    .select("section, data")
    .eq("property_id", propertyId);

  if (dErr) throw new Error(`Details fetch failed: ${dErr.message}`);

  const settings: SettingsBundle = {};
  for (const row of details || []) {
    settings[row.section as string] = row.data as Record<string, unknown>;
  }

  // 2. Compute hash of inputs for change detection
  const settingsJson = JSON.stringify({ property, settings });
  const sourceHash = createHash("sha256").update(settingsJson).digest("hex");

  // 3. Build the 11-step diagram from settings
  const steps: WorkflowStep[] = [
    buildStepInquiry(),
    buildStepBookingRequest(),
    buildStepAccept(),
    buildStepWelcome(settings),
    buildStepPreArrivalPrep(settings),
    buildStepArrivalDay(settings),
    buildStepDuringStay(),
    buildStepCheckoutDay(settings),
    buildStepTurnover(),
    buildStepReview(),
    buildStepClose(),
  ];

  return {
    property_id: propertyId,
    steps,
    compiled_at: new Date().toISOString(),
    source_settings_hash: sourceHash,
  };
}

/**
 * Compiles + persists. Use this when settings change.
 * Preserves overrides from previous compilation.
 */
export async function compileAndSaveWorkflow(
  propertyId: string
): Promise<WorkflowDiagram> {
  const diagram = await compileWorkflow(propertyId);

  // Get existing overrides if any so we don't blow them away on recompile.
  const { data: existing } = await supabaseAdmin
    .from("property_workflows")
    .select("overrides")
    .eq("property_id", propertyId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("property_workflows").upsert(
    {
      property_id: propertyId,
      compiled_at: diagram.compiled_at,
      source_settings_hash: diagram.source_settings_hash,
      steps: diagram.steps,
      overrides: existing?.overrides ?? {},
    },
    { onConflict: "property_id" }
  );

  if (error) {
    throw new Error(`Workflow upsert failed: ${error.message}`);
  }

  return diagram;
}

/* ------------------------------------------------------------------ */
/* Step builders                                                      */
/* ------------------------------------------------------------------ */

function buildStepInquiry(): WorkflowStep {
  return {
    id: "INQUIRY",
    title: "Inquiry",
    description: "Guest asks a question, no booking yet",
    order: 1,
    enabled: true,
    source_cards: [],
    trigger: { type: "event", event: "inquiry_email_received" },
    actions: [
      {
        type: "noop",
        description:
          "Show in Messages tab. AI drafter generates a response (Sprint B.4+).",
      },
    ],
    execution_mode: "manual",
    variables_referenced: [],
  };
}

function buildStepBookingRequest(): WorkflowStep {
  return {
    id: "BOOKING_REQUEST",
    title: "Booking Request",
    description: "Reservation request received from guest",
    order: 2,
    enabled: true,
    source_cards: [],
    trigger: { type: "event", event: "booking_request_email_received" },
    actions: [
      {
        type: "send_telegram_ping",
        description: "Notify host that a new booking request arrived",
      },
    ],
    execution_mode: "semi_auto",
    variables_referenced: [
      "guest_name",
      "checkin_date",
      "checkout_date",
      "property_nickname",
    ],
  };
}

function buildStepAccept(): WorkflowStep {
  return {
    id: "ACCEPT",
    title: "Accept Booking",
    description: "Approve the reservation",
    order: 3,
    enabled: true,
    source_cards: [],
    trigger: { type: "event", event: "booking_request_acknowledged" },
    actions: [
      {
        type: "send_telegram_ping",
        description:
          "Manual approval required — accept or decline in Airbnb/VRBO app",
      },
    ],
    execution_mode: "manual",
    variables_referenced: [],
  };
}

function buildStepWelcome(settings: SettingsBundle): WorkflowStep {
  const arrival = settings.arrival_flow ?? {};
  // welcome_enabled defaults TRUE per B.1 ArrivalFlowCard DEFAULT.
  const enabled = arrival.welcome_enabled !== false;
  const template =
    arrival.welcome_template ??
    "Hi {{guest_name}}, welcome!\n\n" +
      "You're all set for your stay at {{property_nickname}} from {{checkin_date}} to {{checkout_date}}.\n\n" +
      "Check-in is after {{checkin_time}}. Your door code will be {{lock_code}}.\n\n" +
      "WiFi: {{wifi_network}} / {{wifi_password}}\n\n" +
      "Looking forward to hosting you!";

  return {
    id: "WELCOME_MESSAGE",
    title: "Welcome Message",
    description: "Send welcome message to guest after booking is accepted",
    order: 4,
    enabled,
    source_cards: ["arrival_flow", "wifi_and_tech", "access_and_locks"],
    trigger: { type: "event", event: "booking_accepted" },
    actions: enabled
      ? [
          {
            type: "send_message_to_guest",
            template,
            recipient_role: "guest",
            description:
              "Send welcome message via Airbnb/VRBO platform (or Telegram ping for manual send)",
          },
        ]
      : [
          {
            type: "noop",
            description: "Welcome message disabled for this property",
          },
        ],
    execution_mode: enabled ? "semi_auto" : "skipped",
    variables_referenced: enabled ? extractVariables(template) : [],
  };
}

function buildStepPreArrivalPrep(settings: SettingsBundle): WorkflowStep {
  const access = settings.access_and_locks ?? {};
  const departure = settings.departure_flow ?? {};

  const actions: WorkflowAction[] = [];

  // Lock update sub-step
  if (access.lock_type === "yale_smart_lock" || access.lock_type === undefined) {
    // Default lock_type per B.1 is yale_smart_lock — treat undefined as default.
    const codeMethod = access.code_method ?? "phone_last_4";
    const codeRule =
      codeMethod === "phone_last_4"
        ? "last 4 digits of guest's phone number"
        : codeMethod === "custom_static"
        ? `static code ${access.custom_code || "[not set]"}`
        : "[code method not configured]";

    actions.push({
      type: "update_lock_code",
      template:
        `Update Yale lock at {{property_nickname}}:\n` +
        `- Remove previous guest's code\n` +
        `- Add new code (${codeRule}): {{lock_code}}\n` +
        `- Guest: {{guest_name}} arriving {{checkin_date}}`,
      recipient_role: "host",
      description: `Yale lock update — ${codeRule}`,
    });
  }

  // Cleaner notification sub-step
  // cleaner_notify_enabled defaults TRUE per B.1 DepartureFlowCard DEFAULT.
  if (departure.cleaner_notify_enabled !== false) {
    const leadTimeHours = parseInt(departure.cleaner_lead_time ?? "48", 10);
    const cleanerTemplate =
      departure.cleaner_message_template ??
      "Hi {{cleaner_name}}, heads up: checkout at {{property_nickname}} on {{checkout_date}} at {{checkout_time}}. " +
        "Next check-in {{next_checkin_date}}. Let me know if any questions!";

    actions.push({
      type: "notify_cleaner",
      template: cleanerTemplate,
      recipient_role: "cleaner",
      description: `Notify cleaner ${leadTimeHours}h before checkout`,
    });
  }

  return {
    id: "PRE_ARRIVAL_PREP",
    title: "Pre-Arrival Prep",
    description: "Update lock code and notify cleaner before guest arrives",
    order: 5,
    enabled: actions.length > 0,
    source_cards: ["access_and_locks", "departure_flow"],
    trigger: {
      type: "time_relative",
      event: "checkin_pending",
      offset_hours: -24,
      relative_to: "checkin_date",
    },
    actions:
      actions.length > 0
        ? actions
        : [
            {
              type: "noop",
              description: "No pre-arrival actions configured",
            },
          ],
    execution_mode: actions.length > 0 ? "semi_auto" : "skipped",
    variables_referenced: Array.from(
      new Set(actions.flatMap((a) => extractVariables(a.template ?? "")))
    ),
  };
}

function buildStepArrivalDay(settings: SettingsBundle): WorkflowStep {
  const arrival = settings.arrival_flow ?? {};
  // pre_arrival_enabled defaults FALSE per B.1 — only on if explicitly true.
  const enabled = arrival.pre_arrival_enabled === true;
  const template =
    arrival.pre_arrival_template ??
    "Hi {{guest_name}}, just a reminder: check-in tomorrow at {{checkin_time}}. " +
      "Your door code is {{lock_code}}. See you soon!";

  return {
    id: "ARRIVAL_DAY",
    title: "Arrival Day",
    description: "Send pre-arrival reminder to guest",
    order: 6,
    enabled,
    source_cards: ["arrival_flow"],
    trigger: {
      type: "time_relative",
      event: "checkin_imminent",
      offset_hours: -24,
      relative_to: "checkin_date",
    },
    actions: enabled
      ? [
          {
            type: "send_message_to_guest",
            template,
            recipient_role: "guest",
            description: "24h pre-arrival reminder with check-in details",
          },
        ]
      : [{ type: "noop", description: "Pre-arrival reminder disabled" }],
    execution_mode: enabled ? "semi_auto" : "skipped",
    variables_referenced: enabled ? extractVariables(template) : [],
  };
}

function buildStepDuringStay(): WorkflowStep {
  return {
    id: "DURING_STAY",
    title: "During Stay",
    description: "Respond to guest questions and handle issues",
    order: 7,
    enabled: true,
    source_cards: [],
    trigger: { type: "manual" },
    actions: [
      {
        type: "noop",
        description:
          "Guest messages flow through Messages tab. AI drafter assists (Sprint B.4+).",
      },
    ],
    execution_mode: "manual",
    variables_referenced: [],
  };
}

function buildStepCheckoutDay(settings: SettingsBundle): WorkflowStep {
  const departure = settings.departure_flow ?? {};
  // checkout_reminder_enabled defaults TRUE per B.1.
  const enabled = departure.checkout_reminder_enabled !== false;
  const template =
    departure.checkout_reminder_template ??
    "Hi {{guest_name}}, just a friendly reminder — checkout is by {{checkout_time}} today. " +
      "{{checkout_instructions_short}}";

  return {
    id: "CHECKOUT_DAY",
    title: "Checkout Day",
    description: "Remind guest of checkout instructions",
    order: 8,
    enabled,
    source_cards: ["departure_flow"],
    trigger: {
      type: "time_relative",
      event: "checkout_morning",
      offset_hours: 0,
      relative_to: "checkout_date",
    },
    actions: enabled
      ? [
          {
            type: "send_message_to_guest",
            template,
            recipient_role: "guest",
            description: "Morning-of checkout reminder",
          },
        ]
      : [{ type: "noop", description: "Checkout reminder disabled" }],
    execution_mode: enabled ? "semi_auto" : "skipped",
    variables_referenced: enabled ? extractVariables(template) : [],
  };
}

function buildStepTurnover(): WorkflowStep {
  return {
    id: "TURNOVER",
    title: "Turnover",
    description: "Cleaner performs turnover between guests",
    order: 9,
    enabled: true,
    source_cards: ["departure_flow"],
    trigger: {
      type: "time_relative",
      event: "post_checkout",
      offset_hours: 1,
      relative_to: "checkout_date",
    },
    actions: [
      {
        type: "send_telegram_ping",
        description:
          "Confirm cleaner started turnover (manual confirmation for now)",
      },
    ],
    execution_mode: "manual",
    variables_referenced: [],
  };
}

function buildStepReview(): WorkflowStep {
  return {
    id: "REVIEW",
    title: "Review",
    description: "Request guest review and leave host review",
    order: 10,
    enabled: true,
    source_cards: [],
    trigger: { type: "event", event: "guest_checked_out" },
    actions: [
      {
        type: "send_telegram_ping",
        description: "Reminder to leave guest review on platform",
      },
    ],
    execution_mode: "manual",
    variables_referenced: [],
  };
}

function buildStepClose(): WorkflowStep {
  return {
    id: "CLOSE",
    title: "Close",
    description: "Booking complete, archive",
    order: 11,
    enabled: true,
    source_cards: [],
    trigger: { type: "event", event: "review_period_ended" },
    actions: [
      { type: "advance_step", description: "Mark booking as closed" },
    ],
    execution_mode: "fully_auto",
    variables_referenced: [],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}
