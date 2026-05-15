import { useEffect, useRef, useState } from "react";
import { Download, FileJson, FileSpreadsheet, FileCode2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExportFormat } from "@/lib/export-utils";
import { cn } from "@/lib/utils";

interface Props {
  onExport: (format: ExportFormat) => void;
  label?: string;
  size?: "sm" | "md";
  align?: "left" | "right";
  formats?: ExportFormat[];
}

const META: Record<ExportFormat, { label: string; icon: any; desc: string }> = {
  json: { label: "JSON",  icon: FileJson,        desc: "Structured data" },
  csv:  { label: "CSV",   icon: FileSpreadsheet,  desc: "Spreadsheet"    },
  html: { label: "HTML",  icon: FileCode2,        desc: "Shareable report" },
};

export function ExportMenu({ onExport, label = "Export", size = "sm", align = "right", formats = ["json","csv","html"] }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent)    => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",   onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cn("inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 text-foreground hover:bg-muted/40 transition-colors",
          size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm")}>
        <Download className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
        {label}
        {label && <ChevronDown className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5","opacity-60")} aria-hidden />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity:0, y:-4, scale:0.98 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-4, scale:0.98 }}
            transition={{ duration:0.12 }} role="menu"
            className={cn("absolute z-30 mt-1 w-52 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-xl shadow-elegant overflow-hidden p-1",
              align === "right" ? "right-0" : "left-0")}>
            {formats.map((f) => {
              const Icon = META[f].icon;
              return (
                <button key={f} role="menuitem" onClick={() => { onExport(f); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-muted/50 transition-colors">
                  <span className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-medium text-foreground">Download .{f}</span>
                    <span className="block text-[10.5px] text-muted-foreground">{META[f].desc}</span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
