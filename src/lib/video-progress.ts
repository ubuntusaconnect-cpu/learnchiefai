import { supabase } from "@/integrations/supabase/client";
import { queueProgress, pendingProgress, clearPendingProgress } from "./offline-videos";

export interface ProgressUpdate {
  userId: string;
  contentId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  offline: boolean;
}

async function pushToServer(u: ProgressUpdate, clientUpdatedAt: string, watchedOffline: boolean) {
  // Conflict-safe: never overwrite a newer record from another device.
  const { data: existing } = await supabase
    .from("content_progress")
    .select("id, client_updated_at, position_seconds")
    .eq("user_id", u.userId)
    .eq("content_id", u.contentId)
    .maybeSingle();

  if (existing && existing.client_updated_at && existing.client_updated_at > clientUpdatedAt) return;

  const row = {
    user_id: u.userId,
    content_id: u.contentId,
    position_seconds: u.positionSeconds,
    duration_seconds: u.durationSeconds,
    completed: u.completed,
    watched_offline: watchedOffline,
    client_updated_at: clientUpdatedAt,
  };
  const { error } = await supabase.from("content_progress").upsert(row, { onConflict: "user_id,content_id" });
  if (error) throw error;
}

/** Saves progress online, or queues it locally when offline. */
export async function saveProgress(u: ProgressUpdate): Promise<"synced" | "queued"> {
  const clientUpdatedAt = new Date().toISOString();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    try {
      await pushToServer(u, clientUpdatedAt, u.offline);
      return "synced";
    } catch {
      /* fall through to queue */
    }
  }
  await queueProgress({
    contentId: u.contentId,
    positionSeconds: u.positionSeconds,
    durationSeconds: u.durationSeconds,
    completed: u.completed,
    clientUpdatedAt,
    watchedOffline: true,
  });
  return "queued";
}

/** Flushes everything watched offline. Safe to call repeatedly. */
export async function syncPendingProgress(userId: string): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  let synced = 0;
  let queue: Awaited<ReturnType<typeof pendingProgress>> = [];
  try {
    queue = await pendingProgress();
  } catch {
    return 0;
  }
  for (const p of queue) {
    try {
      await pushToServer(
        {
          userId,
          contentId: p.contentId,
          positionSeconds: p.positionSeconds,
          durationSeconds: p.durationSeconds,
          completed: p.completed,
          offline: true,
        },
        p.clientUpdatedAt,
        p.watchedOffline,
      );
      await clearPendingProgress(p.contentId);
      synced++;
    } catch {
      // keep it queued for the next attempt
    }
  }
  return synced;
}
