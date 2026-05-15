/**
 * storage.ts — Persistent, per-user storage layer
 *
 * All task/file data is namespaced by the signed-in user's email so that
 * different users on the same browser never see each other's history.
 *
 * Key scheme:
 *   cortex_v2_tasks:<email>  — task history for that user
 *   cortex_v2_auth           — current session (global, one at a time)
 *   cortex_v2_prefs:<email>  — per-user preferences
 *
 * Every localStorage call is wrapped in a try/catch so the app never
 * crashes when storage is unavailable (private browsing quota, SSR, etc.).
 */

import type { Task } from "./mock-data";

const AUTH_KEY = "cortex_v2_auth";

// ── SSR / private-browsing guard ─────────────────────────────────────────────

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

// ── Generic helpers ───────────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  if (!isBrowser) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function lsDel(key: string): void {
  if (!isBrowser) return;
  try { localStorage.removeItem(key); } catch {}
}

// ── Per-user key helpers ──────────────────────────────────────────────────────

/** Sanitise email so it's safe as a localStorage key suffix. */
function emailKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

function tasksKey(): string {
  const auth = loadAuth();
  if (!auth?.email) return "cortex_v2_tasks:__guest__";
  return `cortex_v2_tasks:${emailKey(auth.email)}`;
}

function prefsKey(): string {
  const auth = loadAuth();
  if (!auth?.email) return "cortex_v2_prefs:__guest__";
  return `cortex_v2_prefs:${emailKey(auth.email)}`;
}

// ── Task history (per-user, persistent) ──────────────────────────────────────

export function loadTasks(): Task[] {
  return lsGet<any[]>(tasksKey(), []).map((t) => ({
    ...t,
    createdAt: new Date(t.createdAt),
  }));
}

export function saveTasks(tasks: Task[]): void {
  // Keep max 50 tasks per user to avoid localStorage bloat
  lsSet(tasksKey(), tasks.slice(0, 50));
}

export function addTask(task: Task): void {
  const existing = loadTasks();
  saveTasks([task, ...existing.filter((t) => t.id !== task.id)]);
}

export function updateTask(id: string, patch: Partial<Task>): void {
  saveTasks(loadTasks().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function deleteTask(id: string): void {
  saveTasks(loadTasks().filter((t) => t.id !== id));
}

export function clearTasks(): void {
  lsDel(tasksKey());
}

/** Remove tasks older than 7 days — call once on app start */
export function clearOldTasks(): void {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  saveTasks(loadTasks().filter((t) => t.createdAt.getTime() > oneWeekAgo));
}

// ── Auth session ──────────────────────────────────────────────────────────────

export interface AuthSession {
  name: string;
  email: string;
  avatarInitial: string;
  signedInAt: string;
}

export function loadAuth(): AuthSession | null {
  return lsGet<AuthSession | null>(AUTH_KEY, null);
}

export function saveAuth(session: AuthSession): void {
  lsSet(AUTH_KEY, session);
}

export function clearAuth(): void {
  lsDel(AUTH_KEY);
}

// ── User prefs (per-user) ─────────────────────────────────────────────────────

export interface UserPrefs {
  defaultMode: string;
  theme: "dark" | "light" | "system";
}

const DEFAULT_PREFS: UserPrefs = { defaultMode: "General", theme: "dark" };

export function loadPrefs(): UserPrefs {
  return { ...DEFAULT_PREFS, ...lsGet<Partial<UserPrefs>>(prefsKey(), {}) };
}

export function savePrefs(prefs: Partial<UserPrefs>): void {
  lsSet(prefsKey(), { ...loadPrefs(), ...prefs });
}
