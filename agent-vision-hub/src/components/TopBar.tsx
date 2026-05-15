import { motion } from "framer-motion";
import { Activity, Loader2, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function TopBar({ isRunning = false }: { isRunning?: boolean }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="h-14 border-b border-border/40 bg-background/40 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between px-6" role="banner">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2" aria-live="polite">
        {isRunning ? (
          <>
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
            <span className="text-[13px] font-medium text-primary">Agent running…</span>
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          </>
        ) : (
          <>
            <Activity className="h-3.5 w-3.5 text-success" aria-hidden />
            <span className="text-[13px] font-medium text-success">All systems operational</span>
            <span className="ml-1 h-3.5 w-3.5 rounded-full border border-success/40 flex items-center justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            </span>
          </>
        )}
      </motion.div>

      <button onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="h-9 w-9 rounded-full border border-border/60 bg-card/60 hover:bg-muted/60 flex items-center justify-center transition-colors">
        {theme === "dark"
          ? <Sun  className="h-4 w-4 text-warning" />
          : <Moon className="h-4 w-4 text-muted-foreground" />}
      </button>
    </header>
  );
}
