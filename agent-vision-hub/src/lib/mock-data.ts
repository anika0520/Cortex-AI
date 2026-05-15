/**
 * mock-data.ts — Type definitions only.
 * All data is real: tasks come from live AI agent runs.
 * History is stored in localStorage (persistent).
 *
 * The Task interface carries storedSteps and storedSynthesis so that clicking
 * an old history item restores the full UI state WITHOUT re-executing the query.
 */

import type { ExecutionStep, SynthesisResult } from "./agent-engine";

export type StepStatus = "pending" | "running" | "success" | "error";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  status: "running" | "completed" | "failed";
  createdAt: Date;
  durationMs: number;
  /** Fully completed execution steps — stored on task completion, restored on history click. */
  storedSteps?: ExecutionStep[];
  /** Final synthesis result — stored on task completion, restored on history click. */
  storedSynthesis?: SynthesisResult | null;
}
