import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/lib/roles";
import { useOnline } from "@/hooks/useOnline";
import { saveProgress, syncPendingProgress } from "@/lib/video-progress";
import { downloadForOffline, getOfflineBlob, getOfflineMeta, isDownloaded, requestPersistence, formatBytes } from "@/lib/offline-videos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, CheckCircle2, Loader2, WifiOff, HardDrive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/watch/$contentId")({
  component: WatchPage,
  head: () => ({
    meta: [
      { title: "Watch Lesson | Learn Chief" },
      { name: "description", content: "Watch a CAPS video lesson with progress saving, playback speed control and offline download." },
      { property: "og:title", content: "Watch Lesson | Learn Chief" },
      { property: "og:description", content: "CAPS video lesson with resume, playback speed and offline download." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function WatchPage() {
  const { contentId } = Route.useParams();
  const { data: user } = useSession();
  const online = useOnline();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlPct, setDlPct] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [resumeAt, setResumeAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { data: content } = useQuery({
    queryKey: ["watch", contentId, online],
    queryFn: async () => {
      if (!online) return (await getOfflineMeta(contentId)) ? offlineToContent(await getOfflineMeta(contentId)) : null;
      const { data, error } = await supabase
        .from("learning_content")
        .select("id, title, description, grade, subject, section, topic, subtopic, keywords, objectives, duration_seconds, file_path, transcript")
        .eq("id", contentId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Resume position (server when online, otherwise whatever we last stored)
  useEffect(() => {
    if (!user?.id || !online) return;
    supabase
      .from("content_progress")
      .select("position_seconds")
      .eq("user_id", user.id)
      .eq("content_id", contentId)
      .maybeSingle()
      .then(({ data }) => setResumeAt(Number(data?.position_seconds ?? 0)));
  }, [user?.id, contentId, online]);

  // Source: offline blob first (no network at all), else signed URL
  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const have = await isDownloaded(contentId);
        setOfflineCopy(have);
        if (have) {
          const blob = await getOfflineBlob(contentId);
          if (blob) {
            revoke = URL.createObjectURL(blob);
            setSrc(revoke);
            return;
          }
        }
        if (!online) {
          setLoadError("You're offline and this video hasn't been downloaded. Connect to the internet or download it first.");
          return;
        }
        if (!content?.file_path) return;
        const { data, error } = await supabase.storage.from("learning-videos").createSignedUrl(content.file_path, 60 * 60 * 4);
        if (error || !data) throw new Error(error?.message ?? "Could not load the video.");
        setSrc(data.signedUrl);
      } catch (e: any) {
        setLoadError(e?.message ?? "Could not load the video.");
      }
    })();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [contentId, content?.file_path, online]);

  // Sync anything watched offline as soon as we're back online
  useEffect(() => {
    if (online && user?.id) syncPendingProgress(user.id).then((n) => n > 0 && toast.success(`Synced ${n} offline progress update(s)`));
  }, [online, user?.id]);

  // Periodic + unload progress saving
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !user?.id) return;
    let last = 0;
    const save = (force = false) => {
      const pos = el.currentTime;
      if (!force && Math.abs(pos - last) < 5) return;
      last = pos;
      const dur = Number.isFinite(el.duration) ? el.duration : null;
      void saveProgress({
        userId: user.id,
        contentId,
        positionSeconds: pos,
        durationSeconds: dur,
        completed: dur ? pos / dur > 0.95 : false,
        offline: !navigator.onLine,
      });
    };
    const t = setInterval(() => save(), 10000);
    const onPause = () => save(true);
    el.addEventListener("pause", onPause);
    window.addEventListener("pagehide", onPause);
    return () => {
      clearInterval(t);
      el.removeEventListener("pause", onPause);
      window.removeEventListener("pagehide", onPause);
      save(true);
    };
  }, [user?.id, contentId, src]);

  async function download() {
    if (!content?.file_path) return toast.error("This video has no stored file.");
    setDownloading(true);
    setDlPct(0);
    try {
      await requestPersistence();
      const { data, error } = await supabase.storage.from("learning-videos").createSignedUrl(content.file_path, 60 * 60 * 4);
      if (error || !data) throw new Error(error?.message ?? "Could not get a download link.");
      const meta = await downloadForOffline(
        {
          id: content.id,
          title: content.title,
          grade: content.grade ?? null,
          subject: content.subject ?? null,
          section: content.section ?? null,
          topic: content.topic ?? null,
          subtopic: content.subtopic ?? null,
          description: content.description ?? null,
          durationSeconds: content.duration_seconds ?? null,
        },
        data.signedUrl,
        (p) => setDlPct(p),
      );
      setOfflineCopy(true);
      toast.success(`Available offline (${formatBytes(meta.size)})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AppShell>
      {!content && !loadError && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {loadError && (
        <Card className="p-6">
          <div className="flex items-center gap-2 font-semibold text-destructive"><WifiOff className="h-4 w-4" /> Can't play this video</div>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Button asChild variant="ghost" className="mt-3"><Link to="/offline-videos">Go to my offline videos</Link></Button>
        </Card>
      )}
      {content && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-black">
            <video
              ref={videoRef}
              src={src ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                el.playbackRate = speed;
                if (resumeAt > 2 && resumeAt < (el.duration || Infinity) - 5) el.currentTime = resumeAt;
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Speed</span>
            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={speed === s ? "default" : "outline"}
                onClick={() => {
                  setSpeed(s);
                  if (videoRef.current) videoRef.current.playbackRate = s;
                }}
              >
                {s}×
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {offlineCopy ? (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Available Offline
                </span>
              ) : (
                <Button size="sm" onClick={download} disabled={downloading || !online}>
                  {downloading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Download className="mr-2 h-3 w-3" />}
                  {downloading ? `Downloading ${dlPct}%` : "Download for Offline"}
                </Button>
              )}
              <Button asChild size="sm" variant="ghost"><Link to="/offline-videos"><HardDrive className="h-3 w-3" /></Link></Button>
            </div>
          </div>

          <Card className="p-5">
            <h1 className="text-2xl font-bold">{content.title}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              {[content.grade ? `Grade ${content.grade}` : null, content.subject, content.section, content.topic, content.subtopic]
                .filter(Boolean)
                .join(" → ")}
            </div>
            {content.description && <p className="mt-3 text-sm text-muted-foreground">{content.description}</p>}
            {content.objectives?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-semibold">Learning objectives</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {content.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            )}
            {content.keywords?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {content.keywords.map((k: string) => (
                  <span key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{k}</span>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function offlineToContent(m: any) {
  if (!m) return null;
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    grade: m.grade,
    subject: m.subject,
    section: m.section,
    topic: m.topic,
    subtopic: m.subtopic,
    keywords: [],
    objectives: [],
    duration_seconds: m.durationSeconds,
    file_path: null,
    transcript: null,
  };
}
