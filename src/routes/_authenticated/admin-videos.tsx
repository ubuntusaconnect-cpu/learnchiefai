import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, primaryRole } from "@/lib/roles";
import { VideoUploader } from "@/components/app/VideoUploader";
import { ReviewForm } from "@/components/app/VideoReviewForm";
import { publishVideo, setContentStatus, analyzeVideo } from "@/lib/videos.functions";
import { extractVideoEvidence } from "@/lib/video-extract";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldAlert, Trash2, Eye, EyeOff, RotateCcw, Video, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-videos")({
  component: AdminVideosPage,
  head: () => ({
    meta: [
      { title: "AI Video Manager | Learn Chief" },
      { name: "description", content: "Upload lesson videos and let Learn Chief's AI classify them against the CAPS curriculum before you publish." },
      { property: "og:title", content: "AI Video Manager | Learn Chief" },
      { property: "og:description", content: "Upload, review and publish AI-classified CAPS lesson videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  processing: "Processing",
  ai_analyzing: "AI Analyzing",
  awaiting_review: "Awaiting Review",
  published: "Published",
  failed: "Failed",
};

function AdminVideosPage() {
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  if (primaryRole(roles) !== "admin") {
    return (
      <AppShell>
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Admins only</h1>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold">AI Video Manager</h1>
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="manage">Manage videos</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-4"><VideoUploader /></TabsContent>
        <TabsContent value="manage" className="mt-4"><ManagePanel /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ManagePanel() {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishVideo);
  const statusFn = useServerFn(setContentStatus);
  const analyzeFn = useServerFn(analyzeVideo);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin_videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("*")
        .eq("content_type", "video")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (!q.trim()) return true;
    const hay = [r.title, r.subject, r.section, r.topic, r.subtopic, r.original_filename, (r.keywords ?? []).join(" ")]
      .join(" ")
      .toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  async function remove(row: any) {
    if (!confirm(`Delete "${row.title}" and its video file? This cannot be undone.`)) return;
    const paths = [row.file_path, row.thumbnail_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("learning-videos").remove(paths);
    const { error } = await supabase.from("learning_content").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin_videos"] });
  }

  async function toggle(row: any) {
    try {
      if (row.status === "published") {
        await statusFn({ data: { contentId: row.id, status: "awaiting_review" } });
        toast.success("Unpublished");
      } else {
        await publishFn({
          data: {
            contentId: row.id,
            title: row.title,
            description: row.description,
            grade: row.grade,
            subject: row.subject,
            section: row.section,
            topic: row.topic,
            subtopic: row.subtopic,
            keywords: row.keywords ?? [],
            search_tags: row.search_tags ?? [],
            objectives: row.objectives ?? [],
          },
        });
        toast.success("Published");
      }
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    }
  }

  /** Re-runs the real analysis by re-downloading the stored video. */
  async function retry(row: any) {
    if (!row.file_path) return toast.error("This item has no stored video file to analyse.");
    setRetrying(row.id);
    try {
      const { data: signed, error } = await supabase.storage.from("learning-videos").createSignedUrl(row.file_path, 3600);
      if (error || !signed) throw new Error(error?.message ?? "Could not access the stored video.");
      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`Could not download the stored video [${res.status}].`);
      const blob = await res.blob();
      const file = new File([blob], row.original_filename ?? "video.mp4", { type: blob.type || "video/mp4" });
      const evidence = await extractVideoEvidence(file);
      await analyzeFn({
        data: {
          contentId: row.id,
          audioBase64: evidence.audioBase64,
          audioFormat: evidence.audioFormat,
          frames: evidence.frames,
          durationSeconds: evidence.durationSeconds,
          filename: file.name,
        },
      });
      toast.success("Re-analysed — review the results");
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
      qc.invalidateQueries({ queryKey: ["admin_videos"] });
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!isLoading && filtered.length === 0 && (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">No videos yet.</Card>
      )}

      {filtered.map((row) => (
        <Card key={row.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <span className="font-semibold">{row.title || row.original_filename}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS_LABEL[row.status] ?? row.status}</span>
                {row.needs_confirmation && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">⚠️ AI needs confirmation</span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {[row.grade ? `Grade ${row.grade}` : null, row.subject, row.section, row.topic, row.subtopic]
                  .filter(Boolean)
                  .join(" → ") || "Not classified yet"}
              </div>
              {row.error_message && (
                <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{row.error_message}</div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                {openId === row.id ? "Close" : "Edit"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(row)} disabled={!row.grade || !row.subject}>
                {row.status === "published" ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => retry(row)} disabled={retrying === row.id}>
                {retrying === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(row)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </div>

          {openId === row.id && (
            <ReviewForm
              row={row}
              submitLabel={row.status === "published" ? "Save & re-publish" : "Approve & publish"}
              onPublish={async (patch) => {
                try {
                  await publishFn({ data: { contentId: row.id, ...patch } });
                  toast.success("Saved & published");
                  setOpenId(null);
                  qc.invalidateQueries({ queryKey: ["admin_videos"] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not save");
                }
              }}
            />
          )}
        </Card>
      ))}
    </div>
  );
}
