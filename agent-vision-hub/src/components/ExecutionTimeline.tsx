import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Loader2, XCircle, Circle, ChevronDown,
  Copy, Check, Sparkles, Terminal, ArrowLeft, RotateCw,
  Trash2, Clock, Search, X as XIcon, Filter,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { ExportMenu } from "@/components/ExportMenu";
import { exportSteps, type ExportFormat } from "@/lib/export-utils";
import type { ExecutionStep } from "@/lib/agent-engine";
import { cn } from "@/lib/utils";

interface Props {
  steps: ExecutionStep[];
  prompt: string;
  mode?: string;
  isRunning?: boolean;
  synthesis?: { summary: string; keyFindings: string[]; suggestedActions: string[] } | null;
  onRetry?: () => void;
  onNewTask?: () => void;
}

type StatusFilter = "all" | "running" | "success" | "error" | "pending";

export function ExecutionTimeline({ steps, prompt, mode = "General", isRunning = false, synthesis, onRetry, onNewTask }: Props) {
  const [query,        setQuery]        = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const completed   = steps.filter((s) => s.status === "success").length;
  const total       = steps.length;
  const errorCount  = steps.filter((s) => s.status === "error").length;
  const totalMs     = steps.filter((s) => s.status === "success").reduce((a, s) => a + (s.durationMs ?? 0), 0);
  const allDone     = !isRunning && total > 0 && completed === total;
  const q           = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => statusFilter === "all" || s.status === statusFilter)
      .filter(({ s }) => {
        if (!q) return true;
        if (s.title.toLowerCase().includes(q))            return true;
        if (s.description.toLowerCase().includes(q))      return true;
        if (s.output?.summary?.toLowerCase().includes(q)) return true;
        if (s.output?.type === "logs"  && (s.output.content as string[]).some((l) => l.toLowerCase().includes(q))) return true;
        if (s.output?.type === "code"  && String(s.output.content).toLowerCase().includes(q)) return true;
        if (s.output?.type === "text"  && String(s.output.content).toLowerCase().includes(q)) return true;
        return false;
      });
  }, [steps, q, statusFilter]);

  const filters: { key: StatusFilter; label: string; count?: number }[] = [
    { key: "all",     label: "All",     count: steps.length },
    { key: "running", label: "Running"                      },
    { key: "success", label: "Success", count: completed    },
    { key: "error",   label: "Errors",  count: errorCount   },
    { key: "pending", label: "Pending"                      },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Back + status row */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={onNewTask} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />Back
        </button>

        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border",
          isRunning ? "bg-primary/10 border-primary/30 text-primary"
          : allDone ? "bg-success/10 border-success/30 text-success"
          : "bg-destructive/10 border-destructive/30 text-destructive")}>
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : allDone ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {isRunning ? "Running" : allDone ? "Completed" : total === 0 ? "Planning…" : "Failed"}
        </span>

        {totalMs > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />{(totalMs / 1000).toFixed(1)}s
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">· {mode}</span>

        <div className="flex-1" />
        <ExportMenu onExport={(fmt: ExportFormat) => exportSteps(steps as any, prompt, fmt)} label="Export" />
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-border/60 bg-card/60 text-xs text-foreground hover:bg-muted/40 transition-colors">
          <RotateCw className="h-3 w-3" />Retry
        </button>
        <button onClick={onNewTask} aria-label="New task"
          className="h-7 w-7 rounded-md border border-border/60 bg-card/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 flex items-center justify-center transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Prompt heading */}
      <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-foreground leading-snug mb-6">{prompt}</h1>

      {/* Timeline header + search */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Execution Timeline</div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps & logs…" aria-label="Search execution steps"
            className="h-7 pl-8 pr-7 text-xs rounded-md bg-muted/40 border border-border/60 outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/70 w-52" />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded text-muted-foreground hover:text-foreground flex items-center justify-center">
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div role="tablist" aria-label="Filter steps by status" className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Filter className="h-3 w-3 text-muted-foreground mr-0.5" aria-hidden />
        {filters.map((f) => (
          <button key={f.key} role="tab" aria-selected={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}
            className={cn("h-6 px-2.5 rounded-full text-[11px] border transition-colors",
              statusFilter === f.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
            {f.label}{typeof f.count === "number" && <span className="ml-1 tabular-nums opacity-70">{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-6">
          <div className="h-0.5 rounded-full bg-muted/60 overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="h-full bg-gradient-primary rounded-full" />
          </div>
        </div>
      )}

      {/* Planning placeholder */}
      {steps.length === 0 && isRunning && (
        <div className="flex items-center gap-3 py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />Planning your task…
        </div>
      )}

      {/* Steps */}
      <div className="relative" role="list">
        {total > 0 && <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-border via-border to-transparent" aria-hidden />}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map(({ s, i }) => (
              <StepCard key={s.id} step={s} index={i} query={q} prompt={prompt} />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && total > 0 && (
            <div className="pl-10 py-10 text-center text-xs text-muted-foreground">No steps match your search.</div>
          )}
        </div>
      </div>

      {/* Final synthesis */}
      {synthesis && !isRunning && filtered.length > 0 && <FinalSynthesis synthesis={synthesis} />}
    </div>
  );
}

// ── Highlight helper ──────────────────────────────────────────────────────────

function highlight(text: string, q: string) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return <>{text.slice(0, idx)}<mark className="bg-warning/30 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, query, prompt }: { step: ExecutionStep; index: number; query: string; prompt: string }) {
  const [open, setOpen] = useState(step.status === "running" || step.status === "success");

  const stateLabel = step.status === "running" ? "Executing"
    : step.status === "success" ? "Synthesizing"
    : step.status === "error"   ? "Failed"
    : "Pending";

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative pl-10" role="listitem">
      <div className="absolute left-0 top-3"><StatusIcon status={step.status} /></div>

      <motion.div layout className="overflow-hidden">
        <div className="flex items-start gap-2 group rounded-lg p-2 -m-2 hover:bg-muted/10 transition-colors">
          <button onClick={() => step.output && setOpen(!open)} disabled={!step.output}
            aria-expanded={open} className="flex-1 text-left disabled:cursor-default min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Step {index + 1} · {stateLabel}
              </span>
              {step.durationMs != null && step.status === "success" && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                  <Clock className="h-2.5 w-2.5" aria-hidden />{(step.durationMs / 1000).toFixed(1)}s
                </span>
              )}
              {(step.retryCount ?? 0) > 0 && (
                <span className="text-[10px] text-warning px-1.5 py-0.5 rounded bg-warning/10 border border-warning/20">↻ retry {step.retryCount}</span>
              )}
              {step.output && (
                <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
              )}
            </div>
            <div className="text-[15px] font-semibold text-foreground mb-1">{highlight(step.title, query)}</div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{highlight(step.description, query)}</p>
          </button>

          {/* Per-step export — show on hover */}
          {step.output && step.status !== "pending" && (
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 mt-1">
              <ExportMenu onExport={(fmt: ExportFormat) => exportSteps([step] as any, `${prompt} — step ${index + 1}`, fmt)} label="" size="sm" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {open && step.output && step.status !== "pending" && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className="pt-3">
                {step.output.summary && (
                  <p className="text-[13px] italic text-foreground/80 mb-3 leading-relaxed">{highlight(step.output.summary, query)}</p>
                )}
                <OutputRenderer output={step.output} query={query} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: ExecutionStep["status"] }) {
  if (status === "running") return (
    <div className="h-6 w-6 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
      <Loader2 className="h-3 w-3 text-primary animate-spin" />
    </div>
  );
  if (status === "success") return (
    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="h-6 w-6 rounded-full bg-success border border-success flex items-center justify-center">
      <Check className="h-3.5 w-3.5 text-success-foreground" strokeWidth={3} />
    </motion.div>
  );
  if (status === "error") return (
    <div className="h-6 w-6 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center">
      <XCircle className="h-3.5 w-3.5 text-destructive" />
    </div>
  );
  return (
    <div className="h-6 w-6 rounded-full bg-muted/40 border border-border flex items-center justify-center">
      <Circle className="h-2 w-2 text-muted-foreground" />
    </div>
  );
}

// ── Output renderers ──────────────────────────────────────────────────────────

function OutputRenderer({ output, query = "" }: { output: ExecutionStep["output"]; query?: string }) {
  if (!output) return null;
  if (output.type === "code")  return <CodeBlock code={output.content} />;
  if (output.type === "logs")  return <LogsBlock lines={output.content} query={query} />;
  if (output.type === "table") return <TableView data={output.content} />;
  if (output.type === "chart") return <ChartView data={output.content} />;
  return (
    <div className="rounded-lg bg-muted/30 border border-border/60 p-4 text-[13px] text-foreground/85 leading-relaxed">
      {query ? highlight(String(output.content), query) : String(output.content)}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <div className="rounded-xl overflow-hidden border border-border/60 bg-[oklch(0.05_0.005_260)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-[oklch(0.07_0.005_260)]">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="text-[10px] text-muted-foreground ml-3 uppercase tracking-[0.15em]">PYTHON</span>
        </div>
        <button onClick={copy} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors" aria-label="Copy code">
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-[12.5px] leading-[1.75] overflow-x-auto"><code className="text-foreground/90 font-mono">{code}</code></pre>
    </div>
  );
}

function LogsBlock({ lines, query = "" }: { lines: string[]; query?: string }) {
  const [localFilter, setLocalFilter] = useState("");
  const effective = (query || localFilter).toLowerCase();
  const shown     = effective ? lines.filter((l) => l.toLowerCase().includes(effective)) : lines;

  return (
    <div className="rounded-xl border border-border/60 bg-[oklch(0.05_0.005_260)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-[oklch(0.07_0.005_260)]">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <Terminal className="h-3 w-3 text-muted-foreground ml-2" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em]">LIVE LOGS</span>
        <span className="text-[10px] text-muted-foreground tabular-nums ml-1">· {shown.length}/{lines.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" aria-hidden />
            <input type="search" value={localFilter} onChange={(e) => setLocalFilter(e.target.value)} placeholder="Filter logs…" aria-label="Filter logs"
              className="h-6 pl-7 pr-2 text-[11px] rounded bg-muted/40 border border-border/60 outline-none focus:border-primary/40 placeholder:text-muted-foreground/70 w-32" />
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        </div>
      </div>
      <div className="p-3 font-mono text-[11.5px] leading-relaxed max-h-48 overflow-y-auto" role="log" aria-live="polite">
        {shown.map((line, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-start gap-2">
            <span className="text-primary mt-px select-none">▸</span>
            <span className="text-muted-foreground">{effective ? highlight(line, effective) : line}</span>
          </motion.div>
        ))}
        {shown.length === 0 && <div className="text-center text-muted-foreground/70 py-4 text-[11px]">No matching log lines.</div>}
      </div>
    </div>
  );
}

function TableView({ data }: { data: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>{data.headers?.map((h) => <th key={h} scope="col" className="text-left font-medium text-muted-foreground px-3 py-2.5 uppercase tracking-[0.12em] text-[10px]">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows?.map((row, i) => (
            <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-t border-border/40 hover:bg-muted/10 transition-colors">
              {row.map((cell, j) => <td key={j} className="px-3 py-2.5 text-foreground/85">{cell}</td>)}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartView({ data }: { data: any[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.008 260)" />
          <XAxis dataKey="region" tick={{ fill: "oklch(0.62 0.012 260)", fontSize: 10 }} axisLine={{ stroke: "oklch(0.20 0.008 260)" }} tickLine={false} />
          <YAxis tick={{ fill: "oklch(0.62 0.012 260)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "oklch(0.20 0.008 260 / 0.4)" }} contentStyle={{ backgroundColor: "oklch(0.10 0.006 260)", border: "1px solid oklch(0.20 0.008 260)", borderRadius: "8px", fontSize: "12px" }} />
          <Bar dataKey="revenue" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
          <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.72 0.18 250)" /><stop offset="100%" stopColor="oklch(0.55 0.20 255)" /></linearGradient></defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FinalSynthesis({ synthesis }: { synthesis: { summary: string; keyFindings: string[]; suggestedActions: string[] } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
      className="mt-10 rounded-2xl border border-success/25 bg-gradient-to-br from-success/5 via-card/40 to-card/40 p-6 backdrop-blur-xl shadow-elegant">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-success" />
        <span className="text-[11px] uppercase tracking-[0.22em] text-success font-medium">Final Synthesis</span>
      </div>
      <p className="text-[15px] text-foreground leading-relaxed mb-6">{synthesis.summary}</p>
      <div className="mb-4">
        <div className="text-[12px] font-semibold text-foreground/70 uppercase tracking-[0.14em] mb-2.5">Key findings</div>
        <ul className="space-y-2">
          {synthesis.keyFindings.map((s, i) => (
            <li key={i} className="text-[13px] text-foreground/85 flex items-start gap-2">
              <span className="text-primary mt-0.5 shrink-0">▸</span>{s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[12px] font-semibold text-foreground/70 uppercase tracking-[0.14em] mb-2.5">Suggested next actions</div>
        <ul className="space-y-2">
          {synthesis.suggestedActions.map((s, i) => (
            <li key={i} className="text-[13px] text-foreground/85 flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5 shrink-0">→</span>{s}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
