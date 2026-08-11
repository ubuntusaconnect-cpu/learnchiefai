import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud, FileText, Video, Music, Image as ImageIcon, File as FileIcon,
  Pause, Play, X, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Copy,
} from "lucide-react";
import { beginIngest, attachUploadedFile, classifyUpload, publishUpload, deleteUploadJob } from "@/lib/ingest.functions";
import { sha256File, textFingerprint, extractText, bucketForFile, isSupported } from "@/lib/text-extract";
import { resumableUpload, type ResumableHandle } from "@/lib/resumable-upload";

type Stage =
  | "queued" | "hashing" | "reading" | "checking" | "duplicate"
  | "uploading" | "paused" | "analysing" | "categorising" | "review" | "published" | "skipped" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  hashing: "Fingerprinting",
  reading: "Reading content",
  checking: "Duplicate check",
  duplicate: "Possible duplicate",
  uploading: "Uploading",
  paused: "Paused",
  analysing: "AI analysing",
  categorising: "Categorising",
  review: "Needs review",
  published: "Published",
  skipped: "Skipped (already exists)",
  error: "Failed",
};

interface Row {
  key: string;
  file: File;
  stage: Stage;
  pct: number;
  message?: string;
  error?: string;
  uploadId?: string;
  duplicate?: { kind: string; title: string; location: string; score: number } | null;
  destination?: string;
  confidence?: number;
  handle?: ResumableHandle;
  extracted?: { text: string | null; durationSeconds?: number | null; note?: string };
  hash?: string;
  textHash?: string | null;
}

function iconFor(file: File) {
  const t = file.type || "";
  if (t.startsWith("video/")) return Video;
  if (t.startsWith("audio/")) return Music;
  if (t.startsWith("image/")) return ImageIcon;
  if (t === "application/pdf" || t.startsWith("text/")) return FileText;
  return FileIcon;
}

const MAX_PARALLEL = 3;

export function ContentUploadCenter({ onPublished }: { onPublished?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  const begin = useServerFn(beginIngest);
  const attach = useServerFn(attachUploadedFile);
  const classify = useServerFn(classifyUpload);
  const publish = useServerFn(publishUpload);
  const dropJob = useServerFn(deleteUploadJob);

  const patch = useCallback((key: string, p: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }, []);

  const runFile = useCallback(
    async (key: string) => {
      const row = rowsRef.current.find((r) => r.key === key);
      if (!row) return;
      const file = row.file;
      try {
        // 1 — checksum
        patch(key, { stage: "hashing", pct: 5, error: undefined });
        const hash = await sha256File(file);

        // 2 — real content extraction
        patch(key, { stage: "reading", pct: 12, hash });
        const extracted = await extractText(file);
        const textHash = extracted.text ? await textFingerprint(extracted.text) : null;
        patch(key, { extracted, textHash, message: extracted.note });

        // 3 — duplicate check before any bytes are stored
        patch(key, { stage: "checking", pct: 18 });
        const job = await begin({
          data: { filename: file.name, mimeType: file.type || null, fileSize: file.size, sha256: hash, textHash },
        });
        patch(key, { uploadId: job.uploadId });

        if (job.duplicate) {
          patch(key, {
            stage: "duplicate",
            pct: 20,
            duplicate: { kind: job.duplicate.kind, title: job.duplicate.title, location: job.duplicate.location, score: job.duplicate.score },
          });
          return; // wait for the admin's explicit decision
        }

        await uploadAndClassify(key, job.uploadId, job.alreadyUploaded ? { bucket: job.bucket!, path: job.filePath! } : null);
      } catch (e: any) {
        patch(key, { stage: "error", error: String(e?.message ?? e) });
      }
    },
    [begin, patch],
  );

  const uploadAndClassify = useCallback(
    async (key: string, uploadId: string, already: { bucket: string; path: string } | null, decision?: "keep_both" | "replace") => {
      const row = rowsRef.current.find((r) => r.key === key);
      if (!row) return;
      const file = row.file;
      const bucket = already?.bucket ?? bucketForFile(file);
      const path = already?.path ?? `${new Date().getFullYear()}/${uploadId}/${file.name.replace(/[^\w.\-]+/g, "_")}`;

      if (!already) {
        patch(key, { stage: "uploading", pct: 25 });
        const handle = resumableUpload({
          bucket,
          path,
          file,
          onProgress: (pct) => patch(key, { pct: 25 + Math.round(pct * 0.45) }),
        });
        patch(key, { handle });
        await handle.promise;
        await attach({ data: { uploadId, bucket, filePath: path } });
      }

      // AI analysis on real evidence
      patch(key, { stage: "analysing", pct: 72, handle: undefined });
      const current = rowsRef.current.find((r) => r.key === key);
      const result = await classify({
        data: {
          uploadId,
          extractedText: current?.extracted?.text ?? null,
          durationSeconds: current?.extracted?.durationSeconds ?? null,
        },
      });

      const c = result.classification;
      const dest = [c.grade ? `Grade ${c.grade}` : "?", c.subject ?? "?", c.section, c.topic, c.subtopic]
        .filter(Boolean)
        .join(" → ");
      patch(key, { stage: "categorising", pct: 85, destination: dest, confidence: c.confidence?.overall ?? 0 });

      if (result.duplicate && !decision) {
        patch(key, {
          stage: "duplicate",
          duplicate: { kind: result.duplicate.kind, title: result.duplicate.title, location: result.duplicate.location, score: result.duplicate.score },
        });
        return;
      }

      if (result.needsReview) {
        patch(key, { stage: "review", pct: 90, message: c.reasoning ?? "Low confidence — sent to the review queue." });
        return;
      }

      await publish({ data: { uploadId, ...(decision ? { duplicateDecision: decision } : {}) } });
      patch(key, { stage: "published", pct: 100, message: `Filed under ${dest}` });
      onPublished?.();
    },
    [attach, classify, publish, patch, onPublished],
  );

  const pump = useCallback(async () => {
    // Simple bounded queue so bulk uploads don't saturate the connection.
    const pending = () => rowsRef.current.filter((r) => r.stage === "queued");
    const running = new Set<string>();
    const tick = async () => {
      while (running.size < MAX_PARALLEL) {
        const next = pending()[0];
        if (!next) break;
        patch(next.key, { stage: "hashing" });
        running.add(next.key);
        void runFile(next.key).finally(() => {
          running.delete(next.key);
          void tick();
        });
      }
    };
    await tick();
  }, [patch, runFile]);

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted: Row[] = [];
      for (const f of files) {
        if (!isSupported(f)) {
          toast.error(`${f.name}: this file type is not supported.`);
          continue;
        }
        accepted.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file: f, stage: "queued", pct: 0 });
      }
      if (!accepted.length) return;
      setRows((prev) => [...prev, ...accepted]);
      setTimeout(() => void pump(), 0);
    },
    [pump],
  );

  async function collectEntries(items: DataTransferItemList): Promise<File[]> {
    const out: File[] = [];
    const walk = async (entry: any): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise<void>((res) => entry.file((f: File) => { out.push(f); res(); }, () => res()));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = (): Promise<any[]> => new Promise((res) => reader.readEntries((e: any[]) => res(e), () => res([])));
        let batch = await readBatch();
        while (batch.length) {
          for (const e of batch) await walk(e);
          batch = await readBatch();
        }
      }
    };
    const entries = Array.from(items).map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    for (const e of entries) await walk(e);
    return out;
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    const fromEntries = dt.items?.length ? await collectEntries(dt.items) : [];
    addFiles(fromEntries.length ? fromEntries : Array.from(dt.files));
  }

  async function decide(row: Row, decision: "use_existing" | "replace" | "keep_both" | "cancel") {
    if (!row.uploadId) return;
    try {
      if (decision === "cancel") {
        await dropJob({ data: { uploadId: row.uploadId } });
        setRows((prev) => prev.filter((r) => r.key !== row.key));
        return;
      }
      if (decision === "use_existing") {
        patch(row.key, { stage: "categorising", pct: 95 });
        await publish({ data: { uploadId: row.uploadId, duplicateDecision: "use_existing" } }).catch(async () => {
          await dropJob({ data: { uploadId: row.uploadId! } });
        });
        patch(row.key, { stage: "skipped", pct: 100, message: "Existing content kept — no duplicate created." });
        return;
      }
      patch(row.key, { duplicate: null });
      await uploadAndClassify(row.key, row.uploadId, null, decision === "replace" ? "replace" : "keep_both");
    } catch (e: any) {
      patch(row.key, { stage: "error", error: String(e?.message ?? e) });
    }
  }

  const done = rows.filter((r) => r.stage === "published" || r.stage === "skipped").length;

  return (
    <div className="space-y-4">
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 border-2 border-dashed p-6 text-center transition sm:p-10 ${
          dragging ? "border-primary bg-accent/30" : "border-border"
        }`}
      >
        <UploadCloud className="h-10 w-10 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Drop anything educational here</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            PDFs, notes, question papers, memos, worksheets, videos, audio, images — whole folders too. Learn Chief reads,
            classifies, de-duplicates and files each one automatically.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <label>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
            />
            <Button asChild><span>Select files</span></Button>
          </label>
          <label>
            <input
              type="file"
              multiple
              className="hidden"
              // @ts-expect-error non-standard but supported by Chromium/WebKit
              webkitdirectory=""
              directory=""
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
            />
            <Button variant="outline" asChild><span>Select a folder</span></Button>
          </label>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="font-semibold">Processing queue <span className="text-muted-foreground">({done}/{rows.length} finished)</span></h4>
            <Button size="sm" variant="ghost" onClick={() => setRows((p) => p.filter((r) => !["published", "skipped"].includes(r.stage)))}>
              Clear finished
            </Button>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => {
              const Icon = iconFor(row.file);
              return (
                <li key={row.key} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.file.name}</span>
                        <Badge variant={row.stage === "error" ? "destructive" : row.stage === "published" ? "default" : "secondary"}>
                          {row.stage === "published" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {row.stage === "error" && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {!["published", "error", "skipped", "review", "duplicate", "paused"].includes(row.stage) && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {STAGE_LABEL[row.stage]}
                        </Badge>
                        {row.confidence != null && row.stage !== "error" && (
                          <span className="text-xs text-muted-foreground">AI confidence {row.confidence}%</span>
                        )}
                        <span className="text-xs text-muted-foreground">{(row.file.size / 1_048_576).toFixed(1)} MB</span>
                      </div>

                      {row.stage !== "published" && row.stage !== "skipped" && row.stage !== "error" && (
                        <Progress value={row.pct} className="mt-2 h-1.5" />
                      )}

                      {row.destination && <p className="mt-1 text-xs text-muted-foreground">Destination: {row.destination}</p>}
                      {row.message && <p className="mt-1 text-xs text-muted-foreground">{row.message}</p>}
                      {row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}

                      {row.stage === "duplicate" && row.duplicate && (
                        <div className="mt-2 rounded-md border border-warning/40 bg-accent/30 p-3">
                          <p className="flex items-center gap-2 text-sm font-semibold">
                            <Copy className="h-4 w-4" /> Possible duplicate detected
                            <span className="text-xs font-normal text-muted-foreground">
                              ({row.duplicate.kind === "exact_file" ? "identical file" : row.duplicate.kind === "same_text" ? "same content" : "similar title"} · {row.duplicate.score}%)
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Existing content: <strong>{row.duplicate.title}</strong><br />
                            {row.duplicate.location}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => decide(row, "use_existing")}>Use existing</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(row, "replace")}>Replace existing</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(row, "keep_both")}>Keep both</Button>
                            <Button size="sm" variant="ghost" onClick={() => decide(row, "cancel")}>Cancel upload</Button>
                          </div>
                        </div>
                      )}

                      {row.stage === "review" && (
                        <p className="mt-1 text-xs text-warning-foreground">
                          Sent to <strong>AI Review</strong> — open the Review Queue tab to confirm or correct the classification.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {row.stage === "uploading" && row.handle && (
                        <Button size="icon" variant="ghost" title="Pause upload" onClick={() => { row.handle!.pause(); patch(row.key, { stage: "paused" }); }}>
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {row.stage === "paused" && row.handle && (
                        <Button size="icon" variant="ghost" title="Resume upload" onClick={() => { row.handle!.resume(); patch(row.key, { stage: "uploading" }); }}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {row.stage === "error" && (
                        <Button size="icon" variant="ghost" title="Retry" onClick={() => { patch(row.key, { stage: "queued", pct: 0, error: undefined }); void pump(); }}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remove from queue"
                        onClick={() => { row.handle?.abort(); setRows((p) => p.filter((r) => r.key !== row.key)); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
