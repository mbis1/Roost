// src/lib/workflow-types.ts
//
// Sprint B.2 — Workflow Compiler types.
//
// The compiler (src/lib/workflow-compiler.ts) reads structured settings from
// property_details and emits a WorkflowDiagram. The diagram is stored in
// property_workflows.steps (jsonb).
//
// Templates inside actions stay as raw `{{placeholder}}` strings — variable
// resolution is a later sprint.

export type WorkflowStepId =
  | "INQUIRY"
  | "BOOKING_REQUEST"
  | "ACCEPT"
  | "WELCOME_MESSAGE"
  | "PRE_ARRIVAL_PREP"
  | "ARRIVAL_DAY"
  | "DURING_STAY"
  | "CHECKOUT_DAY"
  | "TURNOVER"
  | "REVIEW"
  | "CLOSE";

export type ExecutionMode =
  | "manual" // just remind me
  | "semi_auto" // Telegram ping with prepared content
  | "fully_auto" // API integration (not yet implemented for any step)
  | "skipped"; // step disabled in this property's workflow

export type TriggerType =
  | "event" // fired by an external event (e.g. booking confirmation email received)
  | "time_relative" // fired N hours before/after another event
  | "manual"; // user advances manually

export type WorkflowActionType =
  | "send_message_to_guest"
  | "send_telegram_ping"
  | "update_lock_code"
  | "notify_cleaner"
  | "advance_step"
  | "noop";

export type WorkflowAction = {
  type: WorkflowActionType;
  template?: string; // raw template with {{placeholder}} variables, never resolved
  recipient_role?: "guest" | "host" | "cleaner" | "vendor";
  description: string; // human-readable explanation for the diagram UI
};

export type WorkflowTrigger = {
  type: TriggerType;
  event?: string; // e.g. "booking_confirmed", "checkin_24h_before"
  offset_hours?: number; // for time_relative
  relative_to?: string; // e.g. "checkin_date"
};

export type WorkflowStep = {
  id: WorkflowStepId;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  source_cards: string[]; // which Layer 1 cards contributed (e.g. ["arrival_flow", "access_and_locks"])
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  execution_mode: ExecutionMode;
  variables_referenced: string[]; // e.g. ["guest_name", "lock_code", "wifi_password"]
};

export type WorkflowDiagram = {
  property_id: string;
  steps: WorkflowStep[];
  compiled_at: string;
  source_settings_hash: string;
};
