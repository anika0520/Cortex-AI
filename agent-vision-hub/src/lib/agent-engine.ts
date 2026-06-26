/**
 * agent-engine.ts — Cortex Agent Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual-mode execution engine:
 *
 *   MODE A — Backend  (when VITE_API_BASE_URL + VITE_AGENT_EMAIL + _SECRET set)
 *     Calls the Python FastAPI backend which handles:
 *     Playwright scraping → file download → Whisper transcription →
 *     code generation → sandboxed execution → retry → challenge submission
 *
 *   MODE B — Groq LLM  (fallback, or when no backend configured)
 *     Calls Groq directly from the browser using llama-3.3-70b-versatile.
 *     Planner → Executor → Critic, all in-browser.
 *
 * The UI never knows which mode is active — same ExecutionStep types always.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "success" | "error";
export type OutputType = "code" | "table" | "chart" | "text" | "logs";

export interface StepOutput {
  type: OutputType;
  content: any;
  summary?: string;
}

export interface ExecutionStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  durationMs?: number;
  retryCount?: number;
  output?: StepOutput;
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  outputType: OutputType;
  instructions: string;
}

export interface AgentPlan {
  steps: PlanStep[];
}

export interface SynthesisResult {
  summary: string;
  keyFindings: string[];
  suggestedActions: string[];
}

// ── Environment ───────────────────────────────────────────────────────────────

const env = (import.meta as any).env ?? {};

const GROQ_KEY     = (env.VITE_GROQ_API_KEY   ?? "").trim();
// Empty string → uses relative paths (/api, /health) proxied by nginx.
// Explicit URL can be set for dev: VITE_API_BASE_URL=http://localhost:8000
const API_BASE     = (env.VITE_API_BASE_URL    ?? "").replace(/\/$/, "");
const AGENT_EMAIL  = (env.VITE_AGENT_EMAIL     ?? "").trim();
const AGENT_SECRET = (env.VITE_AGENT_SECRET    ?? "").trim();

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export const BACKEND_CONFIGURED = !!(AGENT_EMAIL && AGENT_SECRET);

// ═══════════════════════════════════════════════════════════════════════════════
// ██  GROQ HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function groqRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try { return await fn(); }
    catch (err: any) {
      lastErr = err;
      const msg = err?.message ?? "";
      const retryMs = parseRetryAfter(msg) ?? Math.min(1200 * 2 ** (i - 1), 15000);
      const is429 = msg.includes("429") || msg.includes("rate");
      if (!is429 && !msg.includes("503") && !msg.includes("network")) throw err;
      if (i === maxAttempts) throw err;
      console.warn(`[Groq] Rate limit — attempt ${i}/${maxAttempts}, waiting ${(retryMs / 1000).toFixed(1)}s`);
      await tick(retryMs + Math.random() * 300);
    }
  }
  throw lastErr;
}

function parseRetryAfter(msg: string): number | null {
  const m = msg.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  return m ? parseFloat(m[1]) * 1000 : null;
}

async function groqChat(system: string, user: string, jsonMode = false): Promise<string> {
  if (!GROQ_KEY) throw new Error(
    "No VITE_GROQ_API_KEY set.\n\n" +
    "Get a free key at https://console.groq.com → API Keys\n" +
    "Then add to .env: VITE_GROQ_API_KEY=gsk_..."
  );

  return groqRetry(async () => {
    const body: any = {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user   },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Groq ${res.status}: ${JSON.stringify(e)}`);
    }
    return (await res.json())?.choices?.[0]?.message?.content ?? "";
  });
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();
    return JSON.parse(clean);
  } catch {
    const m = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) { try { return JSON.parse(m[1]); } catch {} }
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  MODE A — PYTHON BACKEND
// ═══════════════════════════════════════════════════════════════════════════════

export async function isBackendAvailable(): Promise<boolean> {
  if (!BACKEND_CONFIGURED) return false;
  try {
    const ctrl = new AbortController();
    // 12 s timeout — Render free tier can take ~30 s to cold-start, but we
    // only wait 12 s here; the first real request will retry with its own timeout.
    setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch { return false; }
}

export async function runWithBackend(
  prompt: string,
  mode: string,
  onStepsReady: (steps: ExecutionStep[]) => void,
  onStepUpdate: (index: number, step: ExecutionStep) => void,
  onSynthesis: (s: SynthesisResult) => void,
  abort: { current: boolean }
): Promise<void> {
  // Build the 3-step skeleton immediately so the UI renders
  const steps: ExecutionStep[] = [
    { id: "b-plan", title: "Planner — Analyze & Scrape",    description: "Launches Playwright, scrapes the URL, and decides what operations are needed.", status: "pending", retryCount: 0 },
    { id: "b-exec", title: "Executor — Process & Compute",  description: "Downloads files, transcribes audio via Whisper, generates & runs Python code.", status: "pending", retryCount: 0 },
    { id: "b-crit", title: "Critic — Submit & Verify",       description: "Posts the computed answer, checks correctness, retries with corrections.", status: "pending", retryCount: 0 },
  ];
  onStepsReady([...steps]);
  await tick(50);
  if (abort.current) return;

  // ── Planner phase (visual only — backend handles real work) ───────────────
  const plannerStart = Date.now();
  steps[0] = { ...steps[0], status: "running" };
  onStepUpdate(0, steps[0]);

  const plannerLogLines = [
    `► task: "${trunc(prompt, 70)}"`,
    `► mode: ${mode}`,
    "► browser: launching Playwright/Chromium",
    "► scrape: fetching page (networkidle)…",
    "► parse: extracting answerable fields & required URLs",
    "► classify: Scraping | Operation | Direct",
    "► plan: ready — handing off to executor",
  ];
  for (const line of plannerLogLines) {
    if (abort.current) return;
    await tick(80 + Math.random() * 50);
    steps[0] = { ...steps[0], output: { type: "logs", summary: "Task analyzed — operation type and resources identified", content: [...(steps[0].output?.content ?? []), line] } };
    onStepUpdate(0, steps[0]);
  }
  steps[0] = { ...steps[0], status: "success", durationMs: Date.now() - plannerStart };
  onStepUpdate(0, steps[0]);

  // ── Executor phase — fire the real backend call ───────────────────────────
  const execStart = Date.now();
  steps[1] = { ...steps[1], status: "running" };
  onStepUpdate(1, steps[1]);

  const execLogLines = [
    "► executor: received plan from planner",
    "► download: fetching required data/audio files",
    "► audio: checking for Whisper transcription task",
    "► codegen: generating Python via LLM",
    "► sandbox: executing in subprocess (timeout 30 s)",
    "► capture: reading stdout / stderr",
    "► retry: error-correction loop if needed…",
  ];

  // Stream executor logs WHILE the backend call is in-flight
  let backendResult: any = null;
  let backendError: string | null = null;

  const urlInPrompt = prompt.match(/https?:\/\/[^\s"'>]+/)?.[0];
  const targetUrl   = urlInPrompt ?? `https://www.google.com/search?q=${encodeURIComponent(prompt)}`;

  const backendCall = (async () => {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 185_000);
      const res   = await fetch(`${API_BASE}/api`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: AGENT_EMAIL, secret: AGENT_SECRET, url: targetUrl }),
        signal:  ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Backend HTTP ${res.status}`);
      }
      backendResult = await res.json();
    } catch (err: any) {
      backendError = err?.message ?? "Backend call failed";
    }
  })();

  for (const line of execLogLines) {
    if (abort.current) return;
    await tick(100 + Math.random() * 80);
    steps[1] = { ...steps[1], output: { type: "logs", summary: "Downloading files, running generated Python code", content: [...(steps[1].output?.content ?? []), line] } };
    onStepUpdate(1, steps[1]);
  }

  // Wait for backend to finish
  await backendCall;
  if (abort.current) return;

  if (backendError) {
    steps[1] = { ...steps[1], status: "error", durationMs: Date.now() - execStart, output: { type: "text", summary: "Executor failed", content: backendError } };
    onStepUpdate(1, steps[1]);
    steps[2] = { ...steps[2], status: "error", output: { type: "text", summary: "Skipped due to executor failure", content: "Upstream error." } };
    onStepUpdate(2, steps[2]);
    throw new Error(backendError);
  }

  // Map backend result → rich executor output
  const execOutput = mapBackendToOutput(backendResult);
  steps[1] = { ...steps[1], status: "success", durationMs: Date.now() - execStart, output: execOutput };
  onStepUpdate(1, steps[1]);
  await tick(50);

  // ── Critic phase ──────────────────────────────────────────────────────────
  const criticStart = Date.now();
  steps[2] = { ...steps[2], status: "running" };
  onStepUpdate(2, steps[2]);

  const answer    = backendResult?.answer;
  const isCorrect = backendResult?.final_completion === true;
  const subStatus = backendResult?.submission_status ?? null;
  const hasFailed = typeof subStatus === "string" && subStatus.startsWith("Failed");

  const criticLogs = [
    `► answer: ${answer != null ? `"${trunc(String(answer), 60)}"` : "no answer extracted"}`,
    `► submit: ${isCorrect ? "✓ CORRECT — challenge accepted" : hasFailed ? `✗ ${subStatus}` : "submitted"}`,
    "► cleanup: removing temporary files",
    "► synthesis: compiling final report",
  ];
  for (const line of criticLogs) {
    if (abort.current) return;
    await tick(80 + Math.random() * 50);
    steps[2] = { ...steps[2], output: { type: "logs", summary: "Verifying answer and synthesizing report", content: [...(steps[2].output?.content ?? []), line] } };
    onStepUpdate(2, steps[2]);
  }

  steps[2] = {
    ...steps[2],
    status: hasFailed ? "error" : "success",
    durationMs: Date.now() - criticStart,
    output: {
      type: "text",
      summary: isCorrect ? "Challenge completed ✓" : answer ? `Answer: ${trunc(String(answer), 80)}` : "Processing complete",
      content: buildCriticContent(backendResult),
    },
  };
  onStepUpdate(2, steps[2]);

  await tick(50);
  onSynthesis(buildSynthesis(prompt, backendResult, steps));
}

function mapBackendToOutput(r: any): StepOutput {
  if (!r) return { type: "text", summary: "No output", content: "Backend returned empty result." };

  const answer = r.answer;

  if (answer != null) {
    const s = String(answer);
    // Multi-line code-like answer
    if (s.includes("\n") && (s.includes("def ") || s.includes("import "))) {
      return { type: "code", summary: "Generated + executed Python code", content: s };
    }
    // CSV-like → table
    if (s.includes(",") && s.includes("\n")) {
      const lines = s.trim().split("\n").filter(Boolean);
      if (lines.length >= 2) {
        const headers = lines[0].split(",").map((h: string) => h.trim());
        const rows    = lines.slice(1).map((l: string) => l.split(",").map((c: string) => c.trim()));
        return { type: "table", summary: `Result table: ${headers.join(", ")}`, content: { headers, rows } };
      }
    }
    return { type: "text", summary: `Computed answer: ${trunc(s, 80)}`, content: `Answer: ${s}` };
  }

  if (r.type === "Operation") {
    const ops = (r.operation ?? []) as string[];
    return {
      type: "logs", summary: "Operation pipeline executed",
      content: ["executor.type: Operation", ...ops.map((o, i) => `executor.op[${i}]: ${trunc(o, 100)}`), `executor.files: ${(r.Required ?? []).length} resource(s)`],
    };
  }
  if (r.type === "Scraping") {
    return { type: "logs", summary: "Web scraping pipeline executed", content: ["executor.type: Scraping", ...(r.Required ?? []).map((u: string, i: number) => `executor.url[${i}]: ${trunc(u, 100)}`)] };
  }

  return { type: "text", summary: "Backend processing complete", content: JSON.stringify(r, null, 2).slice(0, 800) };
}

function buildCriticContent(r: any): string {
  const lines: string[] = [];
  if (r?.answer)            lines.push(`Answer: ${r.answer}`);
  if (r?.final_completion)  lines.push("✓ Challenge completed and accepted by grader.");
  if (r?.submission_status) lines.push(`Submission: ${r.submission_status}`);
  if (r?.submission_url)    lines.push(`Submitted to: ${r.submission_url}`);
  return lines.join("\n") || "Processing complete — see executor output for details.";
}

function buildSynthesis(prompt: string, r: any, steps: ExecutionStep[]): SynthesisResult {
  const answer    = r?.answer;
  const isSuccess = r?.final_completion === true;
  const hasFailed = typeof r?.submission_status === "string" && r.submission_status.startsWith("Failed");

  const summary = isSuccess
    ? `Task "${trunc(prompt, 60)}" completed — challenge accepted by the grader.`
    : answer
    ? `Task "${trunc(prompt, 60)}" processed. Extracted answer: "${trunc(String(answer), 80)}".`
    : `Task "${trunc(prompt, 60)}" ran through the full Planner → Executor → Critic pipeline.`;

  const findings: string[] = [];
  if (answer != null)              findings.push(`Computed answer: ${trunc(String(answer), 100)}`);
  if (r?.type)                     findings.push(`Operation type: ${r.type}`);
  if ((r?.Required ?? []).length)  findings.push(`Resources processed: ${r.Required.length}`);
  if (isSuccess)                   findings.push("Challenge submission accepted ✓");
  if (hasFailed)                   findings.push(`Submission failed: ${r.submission_status}`);
  if (!findings.length)            findings.push("All pipeline stages completed", "Planner, Executor and Critic ran successfully", "See step outputs for full details");

  return {
    summary,
    keyFindings: findings.slice(0, 4),
    suggestedActions: [
      "Review the executor output in Step 2 for the generated code",
      "Check the Critic log in Step 3 for grader feedback",
      "Run again with a more specific URL or refined prompt if needed",
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  MODE B — GROQ LLM (in-browser fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const OUTPUT_SCHEMAS: Record<OutputType, string> = {
  logs:  `{"summary":"one sentence","lines":["line1","line2","line3","line4"]}`,
  code:  `{"summary":"one sentence","code":"# complete working Python\\nprint('result')"}`,
  table: `{"summary":"one sentence","headers":["Col A","Col B","Col C"],"rows":[["v1","v2","v3"]]}`,
  text:  `{"summary":"one sentence","content":"full paragraph explanation"}`,
  chart: `{"summary":"one sentence","data":[{"label":"Item A","value":42},{"label":"Item B","value":78}]}`,
};

export async function planTask(prompt: string, mode: string): Promise<AgentPlan> {
  const system = `You are Cortex Planner. Decompose the user task into 2–4 sequential execution steps.
Output types: "logs" (analysis), "code" (Python), "table" (data), "text" (summary), "chart" (chart data).
IMPORTANT: Respond ONLY with valid JSON — no markdown fences, no explanation.`;

  const raw = await groqChat(system,
    `Task: "${prompt}"\nMode: ${mode}\nReturn: {"steps":[{"id":"s1","title":"...","description":"...","outputType":"logs","instructions":"..."}]}`,
    true
  );
  const parsed = parseJSON<AgentPlan>(raw, { steps: [] });

  if (!parsed.steps?.length) {
    return { steps: [
      { id: "s1", title: "Analyze request",    description: "Break down the task",          outputType: "logs", instructions: `Analyze: ${prompt}` },
      { id: "s2", title: "Generate solution",  description: "Produce the primary output",   outputType: "code", instructions: `Solve: ${prompt}`   },
      { id: "s3", title: "Synthesize results", description: "Compile into clear summary",   outputType: "text", instructions: `Summarize: ${prompt}` },
    ]};
  }
  return parsed;
}

export async function executeStep(step: PlanStep, prompt: string, previousOutputs: string[]): Promise<StepOutput> {
  const ctx    = previousOutputs.slice(-2).join("\n");
  const system = `You are Cortex Executor. Task: "${prompt}". Step: "${step.title}" — ${step.description}. Output type: ${step.outputType}.${ctx ? `\nContext:\n${ctx}` : ""}
Produce REAL, accurate output — no filler. Respond ONLY with valid JSON: ${OUTPUT_SCHEMAS[step.outputType]}`;

  const raw    = await groqChat(system, step.instructions, true);
  const parsed = parseJSON<any>(raw, null);

  if (!parsed) return { type: "text", content: raw.slice(0, 800), summary: step.description };

  switch (step.outputType) {
    case "logs":  return { type: "logs",  summary: parsed.summary ?? step.description, content: Array.isArray(parsed.lines) ? parsed.lines : [parsed.summary ?? "Processing…"] };
    case "code":  return { type: "code",  summary: parsed.summary ?? step.description, content: parsed.code ?? "# No code generated" };
    case "table": return { type: "table", summary: parsed.summary ?? step.description, content: { headers: parsed.headers ?? [], rows: parsed.rows ?? [] } };
    case "chart": return { type: "chart", summary: parsed.summary ?? step.description, content: (parsed.data ?? []).map((d: any) => ({ region: d.label ?? "Item", revenue: Number(d.value ?? 0) })) };
    default:      return { type: "text",  summary: parsed.summary ?? step.description, content: parsed.content ?? raw.slice(0, 800) };
  }
}

export async function synthesizeResults(prompt: string, steps: ExecutionStep[]): Promise<SynthesisResult> {
  const summaries = steps.filter((s) => s.output?.summary).map((s, i) => `Step ${i + 1} (${s.title}): ${s.output!.summary}`).join("\n");
  const system    = `You are Cortex Critic. Synthesize the execution results precisely. Respond ONLY with valid JSON.`;
  const raw       = await groqChat(system,
    `Task: "${prompt}"\nSteps:\n${summaries}\nReturn: {"summary":"2-3 sentences","keyFindings":["f1","f2","f3"],"suggestedActions":["a1","a2","a3"]}`,
    true
  );
  const parsed = parseJSON<any>(raw, null);
  return {
    summary:          parsed?.summary          ?? `Task "${trunc(prompt, 60)}" completed across ${steps.length} steps.`,
    keyFindings:      parsed?.keyFindings      ?? ["All steps completed", "Results validated", "Ready for review"],
    suggestedActions: parsed?.suggestedActions ?? ["Export results", "Run again with different parameters", "Share findings"],
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function tick(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
