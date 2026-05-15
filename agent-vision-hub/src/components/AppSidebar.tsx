import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, LayoutDashboard, Plus, Search, FolderOpen,
  LogOut, History, Clock, Trash2, CheckCircle2, XCircle, Activity,
} from "lucide-react";
import { useState } from "react";
import type { Task } from "@/lib/mock-data";
import { loadAuth, clearAuth } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function AppSidebar({
  history = [],
  onSelectTask,
  onClearHistory,
  onDeleteTask,
  onNewTask,
}: {
  history?: Task[];
  /** Called with the full Task object so the caller can restore it without re-running. */
  onSelectTask?: (task: Task) => void;
  onClearHistory?: () => void;
  onDeleteTask?: (id: string) => void;
  /** Called when "New Task" is clicked while already on "/". Resets state without re-mounting. */
  onNewTask?: () => void;
}) {
  const pathname    = useRouterState({ select: (s) => s.location.pathname });
  const navigate    = useNavigate();
  const [query,     setQuery]     = useState("");
  const [showClear, setShowClear] = useState(false);

  const auth    = loadAuth();
  const initial = auth?.avatarInitial ?? auth?.name?.[0]?.toUpperCase() ?? "U";

  const handleSignOut = () => { clearAuth(); navigate({ to: "/auth" }); };

  /** Clicking a history item:
   *  - If on "/" already → restore via onSelectTask callback (no navigation needed)
   *  - If on another page → navigate to "/" then restore via a URL param trick using
   *    sessionStorage so the Index component can pick it up on mount.
   */
  const handleSelectTask = (task: Task) => {
    if (pathname === "/") {
      onSelectTask?.(task);
    } else {
      // Store the task to restore in sessionStorage keyed by id
      try { sessionStorage.setItem("cortex_restore_task", JSON.stringify(task)); } catch {}
      navigate({ to: "/" });
    }
  };

  /** New Task button — reset state if already on "/", otherwise navigate there */
  const handleNewTask = () => {
    if (pathname === "/") {
      onNewTask?.();
    } else {
      navigate({ to: "/" });
    }
  };

  const filtered = history.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <aside className="w-72 shrink-0 border-r border-border/60 bg-sidebar flex flex-col h-screen sticky top-0" aria-label="Primary navigation">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-border/40">
        <Link to="/" className="flex items-center gap-3 group rounded-md" aria-label="Cortex home">
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-primary blur-lg opacity-50 -z-10 group-hover:opacity-80 transition-opacity" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-foreground text-[15px] leading-none">Cortex</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1.5">Agent Platform</div>
          </div>
        </Link>
      </div>

      {/* New task — uses button (not Link) so we can reset state when already on "/" */}
      <div className="px-3 pt-4">
        <button
          onClick={handleNewTask}
          className="flex items-center gap-2 w-full h-10 rounded-lg px-3 border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 hover:border-primary/50 transition-all"
        >
          <Plus className="h-4 w-4" />New Task
        </button>
      </div>

      {/* Nav */}
      <nav className="px-3 mt-2 space-y-0.5" aria-label="Main">
        <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === "/dashboard"} />
        <NavItem to="/files"     icon={FolderOpen}      label="Files"     active={pathname === "/files"}     />
      </nav>

      {/* History header */}
      <div
        className="px-5 mt-5 mb-2 flex items-center gap-1.5"
        onMouseEnter={() => setShowClear(history.length > 0)}
        onMouseLeave={() => setShowClear(false)}
      >
        <History className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium flex-1">History</span>
        <AnimatePresence>
          {showClear && onClearHistory && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              onClick={onClearHistory} title="Clear all history"
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3 w-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Search */}
      <div className="px-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…"
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg bg-muted/40 border border-border/40 outline-none focus:border-primary/40 focus:bg-muted/60 transition-colors placeholder:text-muted-foreground/70" />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <AnimatePresence initial={false}>
          {filtered.map((task, i) => (
            <motion.div key={task.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              transition={{ delay: i * 0.02, duration: 0.22 }}
              className="group relative">
              {/* Main button: restore history — does NOT re-run the query */}
              <button
                onClick={() => handleSelectTask(task)}
                className="w-full text-left p-2.5 pr-8 rounded-lg hover:bg-sidebar-accent/60 transition-colors focus-visible:bg-sidebar-accent">
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 shrink-0">
                    {task.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      : task.status === "running"  ? <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
                      : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground/90 truncate group-hover:text-foreground transition-colors leading-tight">{task.title}</div>
                    <div className="text-[10.5px] text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="capitalize">{task.status}</span>
                      <span>·</span>
                      <span>{task.createdAt.toLocaleDateString()}</span>
                      {task.durationMs > 0 && <><span>·</span><Clock className="h-2.5 w-2.5" /><span>{(task.durationMs / 1000).toFixed(1)}s</span></>}
                    </div>
                  </div>
                </div>
              </button>

              {/* Per-item delete button */}
              {onDeleteTask && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                  title="Delete this task"
                  aria-label={`Delete task: ${task.title}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {history.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10 px-4 leading-relaxed">
            No tasks yet.<br />Run your first task to get started.
          </div>
        )}
        {history.length > 0 && filtered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">No tasks match "{query}"</div>
        )}
      </div>

      {/* Footer — real auth user */}
      <div className="p-3 border-t border-border/40">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/40 transition-colors">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-xs font-semibold text-primary-foreground select-none flex-shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground truncate leading-tight">{auth?.name ?? "Guest"}</div>
            <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">{auth?.email ?? "Not signed in"}</div>
          </div>
          <button onClick={handleSignOut} aria-label="Sign out"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/40 transition-colors flex-shrink-0">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link to={to}
      className={cn("relative flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] transition-colors",
        active ? "text-foreground bg-sidebar-accent" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50")}
      aria-current={active ? "page" : undefined}>
      <Icon className="h-4 w-4" /><span>{label}</span>
    </Link>
  );
}
