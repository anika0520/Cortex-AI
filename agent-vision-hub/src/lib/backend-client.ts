/**
 * backend-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Low-level HTTP client for the Python FastAPI backend.
 * Handles: health check, task submission, polling, file upload helpers.
 *
 * The backend exposes:
 *   POST /api  { email, secret, url }  → BackendResult
 *
 * Because the Python backend is long-running (up to 180 s), this client:
 *   1. POSTs the task
 *   2. Waits for the response (the backend blocks until done)
 *   3. Returns the full result
 *
 * All parsing/mapping to ExecutionStep lives in agent-engine.ts, not here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BackendPayload, BackendResult } from "./backend-types";

const BASE = ((import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TIMEOUT_MS = 190_000; // slightly above the backend's 180 s limit

// ── Health check ─────────────────────────────────────────────────────────────

export async function pingBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/docs`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main task call ────────────────────────────────────────────────────────────

export async function callBackendApi(payload: BackendPayload): Promise<BackendResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body?.detail ?? `Backend responded with HTTP ${res.status}`
      );
    }

    return (await res.json()) as BackendResult;
  } finally {
    clearTimeout(timer);
  }
}

// ── Credential helpers ────────────────────────────────────────────────────────

export function getCredentials(): { email: string; secret: string } {
  return {
    email:  ((import.meta as any).env?.VITE_AGENT_EMAIL  ?? ""),
    secret: ((import.meta as any).env?.VITE_AGENT_SECRET ?? ""),
  };
}

export function hasCredentials(): boolean {
  const { email, secret } = getCredentials();
  return email.length > 0 && secret.length > 0;
}

export { BASE as BACKEND_BASE_URL };
