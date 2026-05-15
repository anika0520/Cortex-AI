import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import {
  Upload, FileText, FileSpreadsheet, FileCode,
  FileImage, Download, Eye, Trash2, CheckCircle2,
  Loader2, X, Inbox,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { loadTasks, deleteTask } from "@/lib/storage";
import type { Task } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "Files — Cortex" },
      { name: "description", content: "Upload files for your agent to process." },
    ],
  }),
  component: FilesPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManagedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "processing" | "ready";
  progress: number;
  createdAt: Date;
  /** In-memory blob — only available during the current session */
  blob?: Blob;
  /** Text preview (first ~1200 chars) for text-like files */
  preview?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function iconFor(type: string) {
  if (type.startsWith("image/"))                                                return FileImage;
  if (type.includes("csv") || type.includes("sheet"))                          return FileSpreadsheet;
  if (type.includes("python") || type.includes("javascript") || type.includes("code")) return FileCode;
  return FileText;
}

function fmtSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readPreview(file: File): Promise<string | undefined> {
  const textTypes = ["text/", "application/json", "application/javascript", "application/xml"];
  const isText    = textTypes.some((t) => file.type.startsWith(t))
    || [".csv", ".py", ".md", ".ts", ".tsx", ".js", ".jsx", ".txt"].some((ext) => file.name.endsWith(ext));
  if (!isText) return undefined;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload  = () => resolve((r.result as string).slice(0, 1200));
    r.onerror = () => resolve(undefined);
    r.readAsText(file.slice(0, 4096));
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

function FilesPage() {
  const [files,   setFiles]   = useState<ManagedFile[]>([]);
  const [drag,    setDrag]    = useState(false);
  const [preview, setPreview] = useState<ManagedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // History from per-user localStorage — stays in sync with sidebar
  const [history, setHistory] = useState<Task[]>(() => loadTasks());

  const handleDeleteTask = useCallback((id: string) => {
    deleteTask(id);
    setHistory(loadTasks());
  }, []);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;

    const fileArray = Array.from(list);
    const incoming: ManagedFile[] = fileArray.map((f) => ({
      id:        crypto.randomUUID(),
      name:      f.name,
      size:      f.size,
      type:      f.type || "application/octet-stream",
      status:    "uploading" as const,
      progress:  0,
      createdAt: new Date(),
      blob:      f,
    }));

    setFiles((prev) => [...incoming, ...prev]);

    // Animate each file through uploading → processing → ready
    for (let i = 0; i < incoming.length; i++) {
      const managed      = incoming[i];
      const originalFile = fileArray[i];

      // Simulate upload progress
      await new Promise<void>((resolve) => {
        let prog = 0;
        const iv = setInterval(() => {
          prog = Math.min(100, prog + Math.random() * 22 + 10);
          setFiles((prev) => prev.map((x) => x.id === managed.id ? { ...x, progress: prog } : x));
          if (prog >= 100) { clearInterval(iv); resolve(); }
        }, 180);
      });

      // Processing
      setFiles((prev) => prev.map((x) => x.id === managed.id ? { ...x, status: "processing" } : x));
      const filePreview = await readPreview(originalFile);
      await new Promise((r) => setTimeout(r, 800));

      // Ready
      setFiles((prev) => prev.map((x) => x.id === managed.id ? { ...x, status: "ready", preview: filePreview } : x));
    }
  };

  const download = (file: ManagedFile) => {
    if (!file.blob) return;
    const url = URL.createObjectURL(file.blob);
    const a   = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((x) => x.id !== id));
    setPreview((p)  => (p?.id === id ? null : p));
  }, []);

  // Prevent background scroll when modal is open
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDrag(true); };
  const handleDragLeave = () => setDrag(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        history={history}
        onDeleteTask={handleDeleteTask}
        onClearHistory={() => setHistory([])}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-5xl mx-auto">
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">File Manager</div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">
              Upload <span className="font-display-italic">files.</span>
            </h1>
            <p className="text-muted-foreground text-sm mb-8">
              Drop any file below. Your agent can read CSV, JSON, PDF, images, code files, and more.
            </p>

            {/* ── Drop zone ─────────────────────────────────── */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drop files or click to browse"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              className={cn(
                "rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all bg-card/30 backdrop-blur-xl",
                drag
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border/60 hover:border-primary/50 hover:bg-card/50"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
                accept=".csv,.json,.pdf,.txt,.py,.js,.ts,.jsx,.tsx,.md,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls"
              />
              <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="text-[16px] font-medium text-foreground mb-1.5">
                Drop files here or <span className="text-primary">browse</span>
              </div>
              <div className="text-xs text-muted-foreground">
                CSV, JSON, PDF, images, Python, Markdown — up to 50 MB per file
              </div>
            </div>

            {/* ── File count ─────────────────────────────────── */}
            <div className="mt-8 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                Session files
              </div>
              <div className="text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"}
              </div>
            </div>

            {/* ── File grid ─────────────────────────────────── */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {files.map((file) => {
                  const Icon = iconFor(file.type);
                  return (
                    <motion.article
                      key={file.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-xl p-4 hover:border-primary/30 transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg border bg-primary/10 border-primary/30 text-primary flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate" title={file.name}>{file.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <span>{fmtSize(file.size)}</span>
                            <span>·</span>
                            <span>{file.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="mt-3 min-h-[18px]">
                        {file.status === "uploading" && (
                          <div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <motion.div className="h-full bg-primary" animate={{ width: `${file.progress}%` }} transition={{ duration: 0.2 }} />
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                              Uploading {Math.round(file.progress)}%
                            </div>
                          </div>
                        )}
                        {file.status === "processing" && (
                          <div className="flex items-center gap-1.5 text-[11px] text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" />Reading file…
                          </div>
                        )}
                        {file.status === "ready" && (
                          <div className="flex items-center gap-1.5 text-[11px] text-success">
                            <CheckCircle2 className="h-3 w-3" />Ready
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setPreview(file)}
                          disabled={file.status !== "ready" || !file.preview}
                          aria-label={`Preview ${file.name}`}
                          className="flex-1 h-7 rounded-md border border-border/60 bg-background/40 text-[11px] text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="h-3 w-3" />Preview
                        </button>
                        <button
                          onClick={() => download(file)}
                          disabled={file.status !== "ready"}
                          aria-label={`Download ${file.name}`}
                          className="flex-1 h-7 rounded-md border border-border/60 bg-background/40 text-[11px] text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                        >
                          <Download className="h-3 w-3" />Download
                        </button>
                        <button
                          onClick={() => removeFile(file.id)}
                          aria-label={`Remove ${file.name}`}
                          className="h-7 w-7 rounded-md border border-border/60 bg-background/40 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-colors flex items-center justify-center"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Empty state */}
            {files.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="text-center py-16 text-sm text-muted-foreground flex flex-col items-center gap-3"
              >
                <Inbox className="h-10 w-10 opacity-30" />
                <span>No files yet — drop some above to get started.</span>
              </motion.div>
            )}
          </div>
        </main>
      </div>

      {/* ── Preview modal ──────────────────────────────────── */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm"
            onClick={() => setPreview(null)}
            role="dialog"
            aria-modal
            aria-labelledby="preview-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-elegant overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                <div id="preview-title" className="text-sm font-medium text-foreground truncate">{preview.name}</div>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                  className="h-8 w-8 rounded-md hover:bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {preview.preview ?? "Binary file — preview unavailable. Use Download instead."}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
