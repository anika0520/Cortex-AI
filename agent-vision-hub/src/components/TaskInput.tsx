import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSubmit: (prompt: string, mode: string) => void;
  disabled?: boolean;
}

const MODES = ["General", "Data Analysis", "Web Research", "Code"];

export function TaskInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("General");
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim(), mode);
    setValue("");
    setUrl("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
        }}
        animate={{
          borderColor: drag ? "oklch(0.62 0.20 255)" : "oklch(0.20 0.008 260)",
          boxShadow: drag
            ? "0 0 0 4px oklch(0.62 0.20 255 / 0.15), var(--shadow-elegant)"
            : "var(--shadow-elegant)",
        }}
        className="relative rounded-2xl border bg-card/80 backdrop-blur-xl overflow-hidden"
      >
        <AnimatePresence>
          {showUrl && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pt-3"
            >
              <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-muted/40 border border-border/60">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  aria-label="URL to analyze"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => {
                    setShowUrl(false);
                    setUrl("");
                  }}
                  aria-label="Remove URL"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <label htmlFor="task-textarea" className="sr-only">
          Task description
        </label>
        <textarea
          id="task-textarea"
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={3}
          placeholder="Describe a task. E.g. 'Find the top 5 papers on retrieval-augmented generation from 2024 and summarize trends.'"
          className="w-full px-5 pt-5 pb-3 bg-transparent resize-none outline-none text-[14.5px] leading-relaxed placeholder:text-muted-foreground/70 min-h-[96px] max-h-[260px]"
          disabled={disabled}
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setShowUrl((s) => !s)}
              aria-pressed={showUrl}
              className={cn(
                "h-8 px-2.5 rounded-full text-xs flex items-center gap-1.5 border transition-colors",
                showUrl
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Link2 className="h-3 w-3" aria-hidden />
              URL
            </button>
            <div className="h-5 w-px bg-border/60 mx-1" />
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "h-8 px-3 rounded-full text-xs transition-all",
                  mode === m
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: value.trim() ? 1.03 : 1 }}
            whileTap={{ scale: 0.97 }}
            onClick={submit}
            disabled={!value.trim() || disabled}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground flex items-center gap-2 text-sm font-medium shadow-glow disabled:opacity-40 disabled:shadow-none transition-opacity"
            aria-label="Run agent (Cmd/Ctrl + Enter)"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Run agent
            <kbd className="hidden sm:inline text-[10px] font-mono opacity-70 ml-1">
              ⌘↵
            </kbd>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
