import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { analyzeVideo, publishVideo } from "@/lib/videos.functions";
import { extractVideoEvidence } from "@/lib/video-extract";
import { uploadWithProgress } from "@/lib/storage-upload";
import { useSession } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UploadCloud, Sparkles, CheckCircle2, AlertTriangle, RotateCcw, Loader2, X } from "lucide-react";
import { ReviewForm } from "./VideoReviewForm";

const MAX_MB = Number(import.meta.env["VITE_MAX_VIDEO_UPLOAD_MB"] ?? 2048);
const ALLOWED = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-m4v", "video/ogg"];

type Phase = "idle" | "uploading" | "processing" | "analyzing" | "review" | "failed";

export function VideoUploader() {
  const { data: user } = useSession();
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeVideo);
  const publishFn = useServerFn(publishVideo);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contentId, setContentId] = useState<string | null>(null);
  const [row, setRow] = useState<any>(null);

  function validate(f: File): string | null {
    if (!ALLOWED.includes(f.type) && !/\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(f.name))
      return `Unsupported format "${f.type || f.name.split(".").pop()}". Use MP4, WebM, MOV, MKV or M4V.`;
    if (f.size > MAX_MB * 1024 * 1024) return `This file is ${(f.size / 1048576).toFixed(0)} MB. The maximum is ${MAX_MB} MB.`;
    if (f.size === 0) return "This file is empty.";
    return null;
  }

  async function start(f: File, existingId?: string) {
    const v = validate(f);
    if (v) {
      setError(v);
      setPhase("failed");
      return;
    }
    setError(null);
    setWarnings([]);
    let id = existingId ?? null;
    try {
      // 1. Create the real database record
      if (!id) {
        const { data, error: insErr } = await supabase
          .from("learning_content")
          .insert({
            content_type: "video",
            status: "uploading",
            title: f.name.replace(/\.[^.]+$/, ""),
            original_filename: f.name,
            file_size: f.size,
            mime_type: f.type || "video/mp4",
            uploaded_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        id = data.id;
      }
      setContentId(id);

      // 2. Real upload to object storage with real progress
      setPhase("uploading");
      setLabel("Uploading to secure storage");
      setPct(0);
      const safeName = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${id}/${Date.now()}-${safeName}`;
      const { promise } = uploadWithProgress("learning-videos", path, f, (p) => setPct(p));
      await promise;
      await supabase
        .from("learning_content")
        .update({ file_path: path, status: "processing", file_size: f.size, mime_type: f.type || "video/mp4", error_message: null })
        .eq("id", id);

      // 3. Real processing: decode frames + audio from the actual video
      setPhase("processing");
      setPct(0);
      const evidence = await extractVideoEvidence(f, (l, p) => {
        setLabel(l);
        setPct(p);
      });
      setWarnings(evidence.warnings);

      if (evidence.thumbnail) {
        const thumbPath = `${id}/thumbnail.jpg`;
        try {
          const up = uploadWithProgress("learning-videos", thumbPath, evidence.thumbnail);
          await up.promise;
          await supabase.from("learning_content").update({ thumbnail_path: thumbPath }).eq("id", id);
        } catch {
          setWarnings((w) => [...w, "The auto thumbnail could not be saved. You can upload one manually."]);
        }
      }

      // 4. Real AI analysis of the content
      setPhase("analyzing");
      setLabel("AI is analysing the lesson content");
      setPct(100);
      const result = await analyzeFn({
        data: {
          contentId: id,
          audioBase64: evidence.audioBase64,
          audioFormat: evidence.audioFormat,
          frames: evidence.frames,
          durationSeconds: evidence.durationSeconds,
          filename: f.name,
        },
      });
      setRow(result.content);
      setPhase("review");
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
      toast.success("AI analysis complete — please review");
    } catch (e: any) {
      const msg = e?.message ?? "Something went wrong.";
      setError(msg);
      setPhase("failed");
      if (id) await supabase.from("learning_content").update({ status: "failed", error_message: msg.slice(0, 1000) }).eq("id", id);
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
    }
  }

  async function publish(patch: any) {
    if (!contentId) return;
    try {
      await publishFn({ data: { contentId, ...patch } });
      toast.success("Published — learners can find it now");
      setPhase("idle");
      setFile(null);
      setRow(null);
      setContentId(null);
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
      qc.invalidateQueries({ queryKey: ["visual_learning"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not publish");
    }
  }

  const busy = phase === "uploading" || phase === "processing" || phase === "analyzing";

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><Sparkles className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-semibold">AI Video Upload</h2>
            <p className="text-sm text-muted-foreground">
              Upload a lesson video — Learn Chief decodes its audio and frames, then the AI determines the grade,
              subject, section, topic, subtopic, title, description and keywords from the real content. Max {MAX_MB} MB.
            </p>
          </div>
        </div>

        <label
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${busy ? "pointer-events-none opacity-60" : "hover:border-primary/60 hover:bg-accent/30"}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setFile(f);
              void start(f);
            }
          }}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="font-medium">{file ? file.name : "Drop a video here or click to choose"}</div>
          <div className="text-xs text-muted-foreground">MP4, WebM, MOV, MKV, M4V</div>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                void start(f);
              }
            }}
          />
        </label>

        {busy && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" /> {label}
              {phase !== "analyzing" && <span className="text-muted-foreground">{pct}%</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-gradient-primary transition-all" style={{ width: `${phase === "analyzing" ? 100 : pct}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              Status: {phase === "uploading" ? "Uploading" : phase === "processing" ? "Processing" : "AI Analyzing"}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Processing notes</div>
            <ul className="mt-1 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {phase === "failed" && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> It failed</div>
            <p className="mt-1 whitespace-pre-wrap text-xs">{error}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => file && start(file, contentId ?? undefined)} disabled={!file}>
                <RotateCcw className="mr-2 h-3 w-3" /> Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPhase("idle"); setError(null); setFile(null); }}>
                <X className="mr-2 h-3 w-3" /> Dismiss
              </Button>
            </div>
          </div>
        )}
      </Card>

      {phase === "review" && row && (
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">AI analysis complete</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Video: {file?.name}</p>
          <ReviewForm row={row} onPublish={publish} />
        </Card>
      )}
    </div>
  );
}
