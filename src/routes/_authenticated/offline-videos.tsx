import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/lib/roles";
import { useOnline } from "@/hooks/useOnline";
import { syncPendingProgress } from "@/lib/video-progress";
import { listDownloads, deleteDownload, deleteAllDownloads, storageUsage, pendingProgress, formatBytes, type OfflineMeta } from "@/lib/offline-videos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Play, HardDrive, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/offline-videos")({
  component: OfflinePage,
  head: () => ({
    meta: [
      { title: "My Offline Videos | Learn Chief" },
      { name: "description", content: "Manage the lesson videos you downloaded for offline study, see storage used and sync your offline progress." },
      { property: "og:title", content: "My Offline Videos | Learn Chief" },
      { property: "og:description", content: "Downloaded CAPS lessons available without Wi-Fi or data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function OfflinePage() {
  const { data: user } = useSession();
  const online = useOnline();
  const [items, setItems] = useState<OfflineMeta[]>([]);
  const [usage, setUsage] = useState({ used: 0, quota: 0, downloadsBytes: 0 });
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    try {
      setItems(await listDownloads());
      setUsage(await storageUsage());
      setPending((await pendingProgress()).length);
    } catch (e: any) {
      toast.error(e?.message ?? "Offline storage is unavailable in this browser.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function sync() {
    if (!user?.id) return;
    setSyncing(true);
    try {
      const n = await syncPendingProgress(user.id);
      toast.success(n ? `Synced ${n} update(s)` : "Everything is already in sync");
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">📥 My Offline Videos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Downloaded lessons play with no Wi-Fi and no data.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${online ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"}`}>
          {online ? "🟢 Online" : "🔴 Offline"}
        </span>
      </div>

      <Card className="mt-5 p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2 font-medium"><HardDrive className="h-4 w-4" /> {items.length} video(s)</div>
          <div className="text-muted-foreground">Downloads: {formatBytes(usage.downloadsBytes)}</div>
          {usage.quota > 0 && <div className="text-muted-foreground">Device allowance: {formatBytes(usage.quota)}</div>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={sync} disabled={!online || syncing || !user}>
              <RefreshCw className={`mr-2 h-3 w-3 ${syncing ? "animate-spin" : ""}`} /> Sync progress{pending ? ` (${pending})` : ""}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={items.length === 0}
              onClick={async () => {
                if (!confirm(`Delete all ${items.length} downloaded video(s)? You'll need internet to watch them again.`)) return;
                await deleteAllDownloads();
                toast.success("All downloads removed");
                await refresh();
              }}
            >
              <Trash2 className="mr-2 h-3 w-3 text-destructive" /> Delete all
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing downloaded yet. Open a lesson in <Link to="/visual-learning" className="text-primary hover:underline">Visual Learning</Link> and tap “Download for Offline”.
          </Card>
        )}
        {items.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-semibold">{m.title}</div>
              <div className="text-xs text-muted-foreground">
                {[m.grade ? `Grade ${m.grade}` : null, m.subject, m.section, m.topic, m.subtopic].filter(Boolean).join(" → ")}
                {` · ${formatBytes(m.size)}`}
              </div>
            </div>
            <div className="flex gap-1">
              <Button asChild size="sm"><Link to="/watch/$contentId" params={{ contentId: m.id }}><Play className="mr-2 h-3 w-3" /> Play</Link></Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`Delete the download of "${m.title}"?`)) return;
                  await deleteDownload(m.id);
                  toast.success("Download deleted");
                  await refresh();
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
