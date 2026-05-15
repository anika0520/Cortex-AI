import { motion } from "framer-motion";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2, XCircle, Clock, TrendingUp,
  Search, Activity, Zap, ArrowRight, Inbox,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { useState, useMemo, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import type { Task } from "@/lib/mock-data";
import { loadTasks, deleteTask } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Cortex" },
      { name: "description", content: "Track your AI agent tasks, success rate, and performance." },
    ],
  }),
  component: Dashboard,
});

function timeAgo(d: Date) {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Dashboard() {
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "failed">("all");

  // Live history — re-read from per-user localStorage (no reload needed)
  const [history, setHistory] = useState<Task[]>(() => loadTasks());

  const handleDeleteTask = useCallback((id: string) => {
    deleteTask(id);
    setHistory(loadTasks());
  }, []);

  const filtered = history.filter((t) => {
    const q = t.title.toLowerCase().includes(query.toLowerCase());
    const f = filter === "all" || t.status === filter;
    return q && f;
  });

  // Derived metrics from real data
  const total     = history.length;
  const completed = history.filter((t) => t.status === "completed").length;
  const failed    = history.filter((t) => t.status === "failed").length;
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "—";
  const avgDuration = completed > 0
    ? (history.filter((t) => t.status === "completed").reduce((a, t) => a + t.durationMs, 0) / completed / 1000).toFixed(1)
    : "—";

  // Build a simple last-7-day chart from real data
  const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { day: d.toLocaleDateString("en", { weekday: "short" }), tasks: 0, date: d };
    });
    history.forEach((t) => {
      const taskDay = t.createdAt.toLocaleDateString("en", { weekday: "short" });
      const bucket  = days.find((d) => d.day === taskDay);
      if (bucket) bucket.tasks++;
    });
    return days;
  }, [history]);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        history={history}
        onDeleteTask={handleDeleteTask}
        onClearHistory={() => { setHistory([]); }}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ── Page header ───────────────────────────────── */}
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">Overview</div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
            </div>

            {/* ── Metrics ───────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon={Activity}     label="Total tasks"   value={String(total)}                                      trend={total > 0 ? "Session" : "—"}            accent="default" delay={0}    />
              <MetricCard icon={CheckCircle2} label="Success rate"  value={`${successRate}%`}                                  trend={`${completed} passed`}                  accent="success" delay={0.05} />
              <MetricCard icon={Clock}        label="Avg execution" value={avgDuration === "—" ? "—" : `${avgDuration}s`}      trend={completed > 0 ? "Avg time" : "—"}       accent="default" delay={0.1}  />
              <MetricCard icon={Zap}          label="Failed tasks"  value={String(failed)}                                     trend={failed > 0 ? "Check logs" : "All clear"} accent={failed > 0 ? "danger" : "primary"} delay={0.15} />
            </div>

            {/* ── Chart ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}
              className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Tasks — last 7 days</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">From your current session</p>
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-success">
                    <TrendingUp className="h-3.5 w-3.5" />{total} total
                  </div>
                )}
              </div>
              <div className="h-52">
                {total === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Inbox className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No tasks yet — run one to see activity here</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="oklch(0.78 0.17 295)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="oklch(0.68 0.19 285)" stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.014 270)" />
                      <XAxis dataKey="day" tick={{ fill: "oklch(0.66 0.018 270)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "oklch(0.66 0.018 270)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.20 0.014 270)", border: "1px solid oklch(0.28 0.014 270)", borderRadius: "8px", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="tasks" stroke="oklch(0.78 0.17 295)" strokeWidth={2} fill="url(#areaGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            {/* ── Task history table ─────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}
              className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden"
            >
              <div className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Task history</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} of {history.length} tasks</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…"
                      className="h-8 pl-8 pr-3 text-xs rounded-lg bg-muted/40 border border-border/60 outline-none focus:border-primary/50 focus:bg-muted/60 transition-colors w-44" />
                  </div>
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border/60">
                    {(["all", "completed", "failed"] as const).map((f) => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={cn("px-2.5 h-7 text-xs rounded-md transition-colors capitalize",
                          filter === f ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                        )}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {history.length === 0 ? (
                  <div className="py-16 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No tasks yet. Run your first task to see it here.</p>
                    <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
                      Start a task <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">No tasks match your filters.</div>
                ) : (
                  filtered.map((task, i) => (
                    <motion.div key={task.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/20 transition-colors group">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      ) : task.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <Activity className="h-4 w-4 text-primary shrink-0 animate-pulse" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{task.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{task.prompt}</div>
                      </div>
                      <div className="hidden sm:flex flex-col items-end text-right shrink-0">
                        <div className="text-xs text-foreground tabular-nums">
                          {task.durationMs > 0 ? `${(task.durationMs / 1000).toFixed(1)}s` : "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{timeAgo(task.createdAt)}</div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>

          </div>
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, trend, accent = "default", delay = 0,
}: { icon: any; label: string; value: string; trend: string; accent?: string; delay?: number }) {
  const iconClass =
    accent === "success" ? "from-success/15 to-success/5 border-success/20 text-success" :
    accent === "primary" ? "from-primary/15 to-primary/5 border-primary/20 text-primary" :
    accent === "danger"  ? "from-destructive/15 to-destructive/5 border-destructive/20 text-destructive" :
    "from-muted/40 to-muted/20 border-border/60 text-muted-foreground";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -2 }} className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("h-9 w-9 rounded-lg bg-gradient-to-br border flex items-center justify-center", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[11px] text-muted-foreground">{trend}</div>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </motion.div>
  );
}
