/**
 * backend-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type contracts that mirror the Python FastAPI backend's request / response
 * structures exactly. These are NEVER shown in the UI directly — they are
 * mapped to ExecutionStep / StepOutput by the adapter layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── What we POST to /api ──────────────────────────────────────────────────────
export interface BackendPayload {
  email: string;
  secret: string;
  url: string;
}

// ── What the backend returns (intermediate or final) ──────────────────────────
export interface BackendResult {
  answerable?: boolean;
  type?: "Scraping" | "Operation";
  Required?: string[];
  operation?: string[];

  // Populated when answerable = true
  email?: string;
  secret?: string;
  url?: string;
  submission_url?: string;
  answer?: string;
  final_completion?: boolean;
  submission_status?: string;
}

// ── Internal progress event emitted by the adapter ───────────────────────────
export type AgentEventType =
  | "plan"        // Planner produced steps
  | "step_start"  // A step began executing
  | "step_done"   // A step finished (success or error)
  | "log"         // Arbitrary log line
  | "synthesis"   // Critic produced final synthesis
  | "error"       // Fatal error
  | "done";       // Pipeline fully complete

export interface AgentEvent {
  type: AgentEventType;
  stepIndex?: number;
  payload?: any;
}
