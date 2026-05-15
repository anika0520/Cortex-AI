import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { TaskInput } from "@/components/TaskInput";
import { ExecutionTimeline } from "@/components/ExecutionTimeline";
import {
  runWithBackend, isBackendAvailable, BACKEND_CONFIGURED,
  planTask, executeStep, synthesizeResults,
  type ExecutionStep, type SynthesisResult,
} from "@/lib/agent-engine";
import { loadTasks, addTask, updateTask, deleteTask, clearTasks, clearOldTasks } from "@/lib/storage";
import type { Task } from "@/lib/mock-data";
import { Sparkles, Cpu, Zap, BarChart3, AlertCircle, Server, Brain } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")((({
  head: () => ({ meta: [{ title: "Cortex — AI Agent Platform" }] }),
  component: Index,
}) as any));

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

type EngineMode = "backend" | "llm" | "checking";

function ModeBadge({ mode }: { mode: EngineMode }) {
  if (mode === "checking") return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 text-[11px] text-muted-foreground mb-6 animate-pulse">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />Checking engine…
    </div>
  );
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium mb-6
        ${mode === "backend" ? "bg-success/10 border-success/30 text-success" : "bg-primary/10 border-primary/30 text-primary"}`}>
      {mode === "backend"
        ? <><Server className="h-3 w-3" />Python backend connected</>
        : <><Brain className="h-3 w-3" />Groq LLM mode</>}
    </motion.div>
  );
}

function Index() {
  const [prompt,  setPrompt]  = useState<string | null>(null);
  const [mode,    setMode]    = useState("General");
  const [steps,   setSteps]   = useState<ExecutionStep[]>([]);
  const [synth,   setSynth]   = useState<SynthesisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [history, setHistory] = useState<Task[]>(() => loadTasks());
  const [engine,  setEngine]  = useState<EngineMode>("checking");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef(false);

  // On mount: detect engine, prune old tasks, and check if another page
  // triggered a history restore via sessionStorage.
  useEffect(() => {
    clearOldTasks();
    if (!BACKEND_CONFIGURED) { setEngine("llm"); } else {
      isBackendAvailable().then((ok) => setEngine(ok ? "backend" : "llm"));
    }

    // Cross-page history restore: AppSidebar sets this when navigating from
    // /dashboard or /files to / with a task to display.
    try {
      const raw = sessionStorage.getItem("cortex_restore_task");
      if (raw) {
        sessionStorage.removeItem("cortex_restore_task");
        const task: Task = { ...JSON.parse(raw), createdAt: new Date(JSON.parse(raw).createdAt) };
        applyRestore(task);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (steps.length && scrollRef.current)
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [steps, synth]);

  /** Apply a stored task to the view — zero API calls. */
  const applyRestore = (task: Task) => {
    abortRef.current = true;
    setRunning(false);
    setError(null);
    setPrompt(task.prompt);
    setMode(task.mode ?? "General");
    setSteps(task.storedSteps ?? []);
    setSynth(task.storedSynthesis ?? null);
  };

  // ── LLM mode runner ───────────────────────────────────────────────────────
  const runLLM = useCallback(async (p: string, m: string, taskId: string, start: number) => {
    const plan = await planTask(p, m);
    if (abortRef.current) return;

    setSteps(plan.steps.map((s) => ({ id: s.id, title: s.title, description: s.description, status: "pending" as const, retryCount: 0 })));
    await delay(350);

    const prevSummaries: string[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      if (abortRef.current) return;
      const ps = plan.steps[i];
      const t0 = Date.now();
      setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "running" as const } : s));

      let out: ExecutionStep["output"] | null = null;
      let retries = 0;
      while (retries <= 2) {
        try { out = await executeStep(ps, p, prevSummaries); break; }
        catch {
          retries++;
          if (retries > 2) throw new Error("Step failed after 3 attempts");
          setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, retryCount: retries } : s));
          await delay(800 * retries);
        }
      }
      if (abortRef.current) return;
      if (out?.summary) prevSummaries.push(`${ps.title}: ${out.summary}`);
      setSteps((prev) => prev.map((s, idx) => idx === i
        ? { ...s, status: "success" as const, durationMs: Date.now() - t0, output: out!, retryCount: retries }
        : s));
      if (i < plan.steps.length - 1) await delay(200);
    }

    if (abortRef.current) return;
    const done = await new Promise<ExecutionStep[]>((res) => { setSteps((s) => { res(s); return s; }); });
    const syn  = await synthesizeResults(p, done);
    setSynth(syn);
    updateTask(taskId, { status: "completed", durationMs: Date.now() - start, storedSteps: done, storedSynthesis: syn });
    setHistory(loadTasks());
  }, []);

  // ── Backend mode runner ───────────────────────────────────────────────────
  const runBackend = useCallback(async (p: string, m: string, taskId: string, start: number) => {
    let finalSteps: ExecutionStep[] = [];
    let finalSynth: SynthesisResult | null = null;

    await runWithBackend(
      p, m,
      (initialSteps) => { finalSteps = initialSteps; setSteps(initialSteps); },
      (idx, step)    => setSteps((prev) => { const n = [...prev]; n[idx] = step; finalSteps = n; return n; }),
      (syn)          => { finalSynth = syn; setSynth(syn); },
      abortRef
    );
    updateTask(taskId, { status: "completed", durationMs: Date.now() - start, storedSteps: finalSteps, storedSynthesis: finalSynth });
    setHistory(loadTasks());
  }, []);

  // ── Master task runner ────────────────────────────────────────────────────
  const startTask = useCallback(async (p: string, m: string) => {
    abortRef.current = false;
    setPrompt(p); setMode(m); setSteps([]); setSynth(null); setError(null); setRunning(true);

    const start  = Date.now();
    const taskId = crypto.randomUUID();
    const task: Task = {
      id: taskId,
      title: p.length > 60 ? p.slice(0, 60) + "…" : p,
      prompt: p, mode: m,
      status: "running",
      createdAt: new Date(),
      durationMs: 0,
    };
    addTask(task);
    setHistory(loadTasks());

    try {
      const useBackend = BACKEND_CONFIGURED && (engine === "backend" || await isBackendAvailable().catch(() => false));
      if (useBackend) await runBackend(p, m, taskId, start);
      else            await runLLM(p, m, taskId, start);
    } catch (err: any) {
      if (abortRef.current) return;
      const msg = err?.message ?? "An unexpected error occurred.";
      setError(msg);
      setSteps((prev) => prev.map((s) =>
        (s.status === "running" || s.status === "pending") ? { ...s, status: "error" as const } : s));
      updateTask(taskId, { status: "failed" });
      setHistory(loadTasks());
    } finally {
      setRunning(false);
    }
  }, [engine, runBackend, runLLM]);

  /**
   * Restore a historical task — called by AppSidebar when on "/".
   * Zero API calls, zero re-execution.
   */
  const restoreTask = useCallback((task: Task) => {
    applyRestore(task);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteTask = useCallback((id: string) => {
    deleteTask(id);
    setHistory(loadTasks());
  }, []);

  /** Reset to empty home screen — called by "New Task" button when already on "/". */
  const resetToHome = useCallback(() => {
    abortRef.current = true;
    setPrompt(null);
    setSteps([]);
    setSynth(null);
    setError(null);
    setRunning(false);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        history={history}
        onSelectTask={restoreTask}
        onNewTask={resetToHome}
        onDeleteTask={handleDeleteTask}
        onClearHistory={() => { clearTasks(); setHistory([]); }}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar isRunning={running} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!prompt ? (
              <motion.main key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 pt-12 pb-24 relative">
                <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                  className="relative text-center mb-10 max-w-2xl">
                  <ModeBadge mode={engine} />
                  <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground leading-[1.1] mb-5">
                    What should we figure out{" "}<span className="font-display-italic">today?</span>
                  </h1>
                  <p className="text-muted-foreground text-base max-w-lg mx-auto">
                    Describe any task. Cortex plans, executes, and verifies it — step by step, with full transparency.
                  </p>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="relative w-full">
                  <TaskInput onSubmit={startTask} disabled={running} />
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="relative mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full">
                  <CapCard icon={Cpu}       title="Planner"  desc="Scrapes URLs, identifies files, decomposes the task into steps" color="blue"    />
                  <CapCard icon={Zap}       title="Executor" desc="Downloads files, transcribes audio, generates & runs Python"   color="primary" />
                  <CapCard icon={BarChart3} title="Critic"   desc="Submits answers, verifies correctness, synthesizes findings"   color="success" />
                </motion.div>
                {history.length === 0 && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="relative mt-10 text-[12px] text-muted-foreground/60 text-center">
                    Your completed tasks will appear in the sidebar — they persist across page refreshes.
                  </motion.p>
                )}
              </motion.main>
            ) : (
              <motion.main key="active" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-6 py-10">
                {error && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="max-w-3xl mx-auto mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-destructive mb-1">Agent Error</div>
                      <div className="text-[13px] text-destructive/80 whitespace-pre-wrap">{error}</div>
                    </div>
                  </motion.div>
                )}
                <ExecutionTimeline
                  steps={steps} prompt={prompt} mode={mode} isRunning={running} synthesis={synth}
                  onRetry={() => { abortRef.current = true; setTimeout(() => startTask(prompt, mode), 50); }}
                  onNewTask={resetToHome}
                />
                <div className="mt-12 max-w-3xl mx-auto">
                  <TaskInput onSubmit={startTask} disabled={running} />
                </div>
              </motion.main>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function CapCard({ icon: Icon, title, desc, color }: { icon: any; title: string; desc: string; color: string }) {
  const border: Record<string, string> = {
    blue:    "from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40",
    primary: "from-primary/10 to-primary/5 border-primary/20 hover:border-primary/40",
    success: "from-success/10 to-success/5 border-success/20 hover:border-success/40",
  };
  const icon: Record<string, string> = {
    blue:    "text-blue-400 bg-blue-500/10 border-blue-500/20",
    primary: "text-primary bg-primary/10 border-primary/20",
    success: "text-success bg-success/10 border-success/20",
  };
  return (
    <motion.div whileHover={{ y: -2 }} className={`p-5 rounded-2xl border bg-gradient-to-br ${border[color]} backdrop-blur-xl transition-all`}>
      <div className={`h-8 w-8 rounded-lg border flex items-center justify-center mb-3 ${icon[color]}`}><Icon className="h-4 w-4" /></div>
      <div className="text-[14px] font-semibold text-foreground mb-1">{title}</div>
      <div className="text-[12.5px] text-muted-foreground leading-relaxed">{desc}</div>
    </motion.div>
  );
}
