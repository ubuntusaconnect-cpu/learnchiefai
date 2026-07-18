import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAPS_SUBJECTS, GRADES, TERMS, yearRange } from "@/lib/papers";
import { parseFilename, buildTitle } from "@/lib/paper-parser";
import { toast } from "sonner";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FolderUp, RotateCw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type RowStatus = "pending" | "ready" | "uploading" | "done" | "error" | "duplicate" | "skipped";

type Row = {
  id: string;
  file: File;
  grade: number | null;
  subject: string | null;
  term: number | null;
  year: number | null;
  isMemo: boolean;
  title: string;
  status: RowStatus;
  progress: number;
  error?: string;
};

let rowSeq = 0;
const newId = () => `r${++rowSeq}_${Date.now()}`;

async function collectFiles(items: DataTransferItemList | null, files: FileList | null): Promise<File[]> {
  const out: File[] = [];
  if (items && items.length && items[0].webkitGetAsEntry) {
    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const e = items[i].webkitGetAsEntry?.();
      if (e) entries.push(e);
    }
    async function walk(entry: any): Promise<void> {
      if (entry.isFile) {
        const f: File = await new Promise((res) => entry.file(res));
        out.push(f);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const children: any[] = await new Promise((res) => reader.readEntries(res));
        for (const c of children) await walk(c);
      }
    }
    for (const e of entries) await walk(e);
  } else if (files) {
    for (let i = 0; i < files.length; i++) out.push(files[i]);
  }
  return out.filter((f) => /\.pdf$/i.test(f.name));
}

export function BulkPaperImporter() {
  const { data: user } = useSession();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const next: Row[] = files.map((file) => {
      const p = parseFilename(file.name);
      return {
        id: newId(),
        file,
        grade: p.grade,
        subject: p.subject,
        term: p.term,
        year: p.year,
        isMemo: p.isMemo,
        title: p.grade && p.subject && p.term && p.year
          ? buildTitle({ grade: p.grade, subject: p.subject, term: p.term, year: p.year, isMemo: p.isMemo })
          : p.title,
        status: "pending",
        progress: 0,
      };
    });
    setRows((prev) => [...prev, ...next]);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = await collectFiles(e.dataTransfer.items, e.dataTransfer.files);
    if (!files.length) { toast.error("No PDF files found"); return; }
    addFiles(files);
  }, [addFiles]);

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearDone() {
    setRows((prev) => prev.filter((r) => r.status !== "done" && r.status !== "skipped"));
  }

  const stats = useMemo(() => {
    const s = { total: rows.length, done: 0, error: 0, dup: 0, missing: 0 };
    rows.forEach((r) => {
      if (r.status === "done") s.done++;
      else if (r.status === "error") s.error++;
      else if (r.status === "duplicate") s.dup++;
      if (!r.grade || !r.subject || !r.term || !r.year) s.missing++;
    });
    return s;
  }, [rows]);

  async function uploadRow(row: Row): Promise<void> {
    if (!row.grade || !row.subject || !row.term || !row.year) {
      update(row.id, { status: "error", error: "Missing grade/subject/term/year" });
      return;
    }

    // Duplicate check: same grade+subject+term+year+isMemo+title
    const { data: existing } = await supabase
      .from("question_papers")
      .select("id, memo_path, paper_path")
      .eq("grade", row.grade)
      .eq("subject", row.subject)
      .eq("term", row.term)
      .eq("year", row.year)
      .limit(50);

    // If memo, look for matching question paper (same key, no memo)
    const key = `${row.grade}/${row.year}/T${row.term}/${row.subject.replace(/\s+/g, "_")}`;
    const stamp = Date.now();
    const path = `${key}/${stamp}-${row.isMemo ? "memo" : "paper"}-${row.file.name}`;

    update(row.id, { status: "uploading", progress: 10 });

    // Attempt link memo to existing question paper without memo
    if (row.isMemo && existing && existing.length) {
      const match = existing.find((e) => !e.memo_path);
      if (match) {
        const { error: upErr } = await supabase.storage.from("question-papers").upload(path, row.file, {
          upsert: false, contentType: "application/pdf",
        });
        if (upErr) { update(row.id, { status: "error", error: upErr.message }); return; }
        const { error } = await supabase.from("question_papers").update({ memo_path: path }).eq("id", match.id);
        if (error) { update(row.id, { status: "error", error: error.message }); return; }
        update(row.id, { status: "done", progress: 100 });
        return;
      }
    }

    // Duplicate: same key and same paper role already present
    const dupField = row.isMemo ? "memo_path" : "paper_path";
    const isDup = (existing ?? []).some((e: any) => !!e[dupField]);
    if (isDup) {
      update(row.id, { status: "duplicate", error: "Already exists — skipped" });
      return;
    }

    update(row.id, { progress: 40 });
    const { error: upErr } = await supabase.storage.from("question-papers").upload(path, row.file, {
      upsert: false, contentType: "application/pdf",
    });
    if (upErr) { update(row.id, { status: "error", error: upErr.message }); return; }

    update(row.id, { progress: 75 });
    const payload: any = {
      title: row.title || buildTitle({ grade: row.grade, subject: row.subject, term: row.term, year: row.year, isMemo: row.isMemo }),
      grade: row.grade, subject: row.subject, term: row.term, year: row.year,
      uploaded_by: user?.id ?? null,
    };
    if (row.isMemo) payload.memo_path = path; else payload.paper_path = path;

    const { error } = await supabase.from("question_papers").insert(payload);
    if (error) { update(row.id, { status: "error", error: error.message }); return; }
    update(row.id, { status: "done", progress: 100 });
  }

  async function startUpload() {
    const queue = rows.filter((r) => r.status === "pending" || r.status === "error");
    if (!queue.length) { toast.info("Nothing to upload"); return; }
    setUploading(true);
    cancelRef.current = false;
    for (const r of queue) {
      if (cancelRef.current) break;
      const fresh = { ...r, status: "pending" as RowStatus, progress: 0, error: undefined };
      update(r.id, fresh);
      try { await uploadRow(fresh); } catch (e: any) {
        update(r.id, { status: "error", error: e?.message ?? "Upload failed" });
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["admin_question_papers"] });
    qc.invalidateQueries({ queryKey: ["question_papers"] });
    toast.success("Bulk import complete");
  }

  function cancel() { cancelRef.current = true; }

  return (
    <div className="space-y-4">
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed p-10 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <div className="rounded-2xl bg-primary/10 p-4 text-primary"><FolderUp className="h-8 w-8" /></div>
        <div>
          <h3 className="text-lg font-semibold">Drag & drop PDFs or folders</h3>
          <p className="text-sm text-muted-foreground">We auto-detect grade, subject, term, year, and paper vs memo from the filename.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Choose files
          </Button>
          <Button variant="outline" onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="mr-2 h-4 w-4" /> Choose folder
          </Button>
        </div>
        <input
          ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
          onChange={async (e) => { const files = await collectFiles(null, e.target.files); addFiles(files); e.target.value = ""; }}
        />
        <input
          ref={folderInputRef} type="file" multiple className="hidden"
          // @ts-expect-error non-standard attribute
          webkitdirectory="" directory=""
          onChange={async (e) => { const files = await collectFiles(null, e.target.files); addFiles(files); e.target.value = ""; }}
        />
      </Card>

      {rows.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="text-sm text-muted-foreground">
              {stats.total} file(s) · {stats.done} done · {stats.dup} duplicate · {stats.error} error{stats.missing ? ` · ${stats.missing} missing metadata` : ""}
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={clearDone} disabled={uploading}>
                <Trash2 className="mr-1 h-3 w-3" /> Clear finished
              </Button>
              {uploading ? (
                <Button size="sm" variant="destructive" onClick={cancel}><X className="mr-1 h-3 w-3" /> Cancel</Button>
              ) : (
                <Button size="sm" onClick={startUpload} disabled={!rows.length || stats.missing > 0}>
                  <Upload className="mr-1 h-3 w-3" /> Upload {rows.filter((r) => r.status === "pending" || r.status === "error").length} file(s)
                </Button>
              )}
            </div>
          </div>
          {stats.missing > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" /> {stats.missing} file(s) need grade, subject, term, or year set before uploading.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-2">File</th>
                  <th className="p-2">Grade</th>
                  <th className="p-2">Subject</th>
                  <th className="p-2">Term</th>
                  <th className="p-2">Year</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="max-w-[220px] p-2">
                      <div className="truncate font-medium" title={r.file.name}>{r.file.name}</div>
                      <div className="text-[10px] text-muted-foreground">{(r.file.size / 1024).toFixed(0)} KB</div>
                      {r.status === "uploading" && (
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary transition-all" style={{ width: `${r.progress}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <Select value={r.grade ? String(r.grade) : ""} onValueChange={(v) => update(r.id, { grade: parseInt(v, 10) })}>
                        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{GRADES.map((g) => <SelectItem key={g} value={String(g)}>{g}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={r.subject ?? ""} onValueChange={(v) => update(r.id, { subject: v })}>
                        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{CAPS_SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={r.term ? String(r.term) : ""} onValueChange={(v) => update(r.id, { term: parseInt(v, 10) })}>
                        <SelectTrigger className="h-8 w-16"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={String(t)}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={r.year ? String(r.year) : ""} onValueChange={(v) => update(r.id, { year: parseInt(v, 10) })}>
                        <SelectTrigger className="h-8 w-24"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{yearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={r.isMemo ? "memo" : "paper"} onValueChange={(v) => update(r.id, { isMemo: v === "memo" })}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paper">Paper</SelectItem>
                          <SelectItem value="memo">Memo</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <StatusPill r={r} />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {r.status === "error" && (
                          <Button size="icon" variant="ghost" onClick={() => uploadRow(r)} title="Retry">
                            <RotateCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)} title="Remove">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusPill({ r }: { r: Row }) {
  if (r.status === "done") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Uploaded</span>;
  if (r.status === "uploading") return <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Uploading</span>;
  if (r.status === "error") return <span title={r.error} className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive"><AlertCircle className="h-3 w-3" /> Error</span>;
  if (r.status === "duplicate") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400"><AlertCircle className="h-3 w-3" /> Duplicate</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Ready</span>;
}
