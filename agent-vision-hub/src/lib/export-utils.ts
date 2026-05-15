// export-utils.ts — convert step outputs and file content to JSON / CSV / HTML
export type ExportFormat = "json" | "csv" | "html";

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: (string | number)[][]) {
  return [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
}

function escHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
export function htmlDocument(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${escHtml(title)}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:780px;margin:48px auto;padding:0 24px;color:#0f172a;line-height:1.6}
h1{font-size:24px;margin:0 0 8px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.18em;color:#64748b;margin:32px 0 8px}
pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;overflow:auto;font-size:12.5px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
th{background:#f8fafc;font-weight:600}.muted{color:#64748b;font-size:13px}
.step{margin:18px 0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;background:#eef2ff;color:#4338ca;margin-right:6px}
</style></head><body>${body}</body></html>`;
}

export function stepOutputToCsv(output: any): string {
  if (!output) return "";
  if (output.type === "table") return toCsv(output.content.headers, output.content.rows);
  if (output.type === "chart" && Array.isArray(output.content)) {
    const h = Object.keys(output.content[0] ?? {});
    return toCsv(h, output.content.map((r: any) => h.map((k) => r[k])));
  }
  if (output.type === "logs") return toCsv(["log"], output.content.map((l: string) => [l]));
  return toCsv(["content"], [[String(output.content ?? "")]]);
}

export function exportSteps(
  steps: Array<{ id: string; title: string; description: string; status: string; durationMs?: number; output?: any }>,
  prompt: string,
  format: ExportFormat,
) {
  const safe  = prompt.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "execution";
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");

  if (format === "json") {
    downloadBlob(`${safe}-${stamp}.json`, JSON.stringify({ prompt, exportedAt: new Date().toISOString(), steps }, null, 2), "application/json");
    return;
  }
  if (format === "csv") {
    downloadBlob(`${safe}-${stamp}.csv`,
      toCsv(["step","title","status","durationMs","summary","outputType"],
        steps.map((s,i) => [i+1, s.title, s.status, s.durationMs ?? "", s.output?.summary ?? "", s.output?.type ?? ""])),
      "text/csv");
    return;
  }
  const stepsHtml = steps.map((s, i) => {
    let out = "";
    if (s.output?.type === "code") out = `<pre>${escHtml(String(s.output.content))}</pre>`;
    else if (s.output?.type === "logs") out = `<pre>${escHtml((s.output.content as string[]).join("\n"))}</pre>`;
    else if (s.output?.type === "table") {
      const t = s.output.content;
      out = `<table><thead><tr>${t.headers.map((h:string)=>`<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r:string[])=>`<tr>${r.map(c=>`<td>${escHtml(String(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    } else if (s.output) out = `<p>${escHtml(String(s.output.content ?? ""))}</p>`;
    return `<div class="step"><span class="badge">Step ${i+1}</span><span class="badge">${escHtml(s.status)}</span>
<strong>${escHtml(s.title)}</strong><p class="muted">${escHtml(s.description)}</p>
${s.output?.summary ? `<p>${escHtml(s.output.summary)}</p>` : ""}${out}</div>`;
  }).join("");
  downloadBlob(`${safe}-${stamp}.html`,
    htmlDocument(prompt, `<h1>${escHtml(prompt)}</h1><p class="muted">Exported ${new Date().toLocaleString()}</p><h2>Execution timeline</h2>${stepsHtml}`),
    "text/html");
}

export function exportFile(file: { name: string; preview?: string; type: string }, format: ExportFormat) {
  const base    = file.name.replace(/\.[^.]+$/,"") || "file";
  const content = file.preview ?? "";
  if (format === "json") {
    downloadBlob(`${base}.json`, JSON.stringify({ name: file.name, type: file.type, content }, null, 2), "application/json");
    return;
  }
  if (format === "csv") {
    const isCsv = file.type.includes("csv") || /,/.test(content.split("\n")[0] ?? "");
    downloadBlob(`${base}.csv`, isCsv ? content : toCsv(["content"],[[content]]), "text/csv");
    return;
  }
  downloadBlob(`${base}.html`, htmlDocument(file.name, `<h1>${escHtml(file.name)}</h1><pre>${escHtml(content)}</pre>`), "text/html");
}
