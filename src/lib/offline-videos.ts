// Real offline video library: IndexedDB blob storage + offline progress queue.
// Downloaded videos are played from local blobs — zero network requests.

const DB_NAME = "learnchief-offline";
const DB_VERSION = 1;
const STORE_VIDEOS = "videos";
const STORE_META = "meta";
const STORE_PROGRESS = "progress";

export interface OfflineMeta {
  id: string;
  title: string;
  grade: number | null;
  subject: string | null;
  section: string | null;
  topic: string | null;
  subtopic: string | null;
  description: string | null;
  durationSeconds: number | null;
  size: number;
  mimeType: string;
  savedAt: string;
}

export interface PendingProgress {
  contentId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  clientUpdatedAt: string;
  watchedOffline: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Offline storage is not available in this browser."));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) db.createObjectStore(STORE_VIDEOS);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS, { keyPath: "contentId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage."));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Offline storage operation failed."));
        t.oncomplete = () => db.close();
      }),
  );
}

/** Ask the browser to keep our downloads (not evicted under storage pressure). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function listDownloads(): Promise<OfflineMeta[]> {
  const all = await tx<OfflineMeta[]>(STORE_META, "readonly", (s) => s.getAll() as IDBRequest<OfflineMeta[]>);
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function isDownloaded(id: string): Promise<boolean> {
  const meta = await tx<OfflineMeta | undefined>(STORE_META, "readonly", (s) => s.get(id));
  return !!meta;
}

export async function getOfflineBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(STORE_VIDEOS, "readonly", (s) => s.get(id));
}

export async function getOfflineMeta(id: string): Promise<OfflineMeta | undefined> {
  return tx<OfflineMeta | undefined>(STORE_META, "readonly", (s) => s.get(id));
}

/** Streams the video into IndexedDB with real byte-level progress. */
export async function downloadForOffline(
  meta: Omit<OfflineMeta, "size" | "savedAt" | "mimeType">,
  signedUrl: string,
  onProgress?: (pct: number, receivedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<OfflineMeta> {
  const res = await fetch(signedUrl, { signal });
  if (!res.ok) throw new Error(`Download failed [${res.status}] — ${res.statusText || "could not fetch the video"}.`);
  const total = Number(res.headers.get("Content-Length") ?? 0);
  const mimeType = res.headers.get("Content-Type") || "video/mp4";

  let blob: Blob;
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as unknown as BlobPart);
        received += value.byteLength;
        onProgress?.(total ? Math.min(99, Math.round((received / total) * 100)) : 0, received, total);
      }
    }
    blob = new Blob(chunks, { type: mimeType });
  } else {
    blob = await res.blob();
  }

  const full: OfflineMeta = {
    ...meta,
    size: blob.size,
    mimeType,
    savedAt: new Date().toISOString(),
  };
  await tx(STORE_VIDEOS, "readwrite", (s) => s.put(blob, meta.id));
  await tx(STORE_META, "readwrite", (s) => s.put(full));
  onProgress?.(100, blob.size, blob.size);
  return full;
}

export async function deleteDownload(id: string): Promise<void> {
  await tx(STORE_VIDEOS, "readwrite", (s) => s.delete(id));
  await tx(STORE_META, "readwrite", (s) => s.delete(id));
}

export async function deleteAllDownloads(): Promise<void> {
  await tx(STORE_VIDEOS, "readwrite", (s) => s.clear());
  await tx(STORE_META, "readwrite", (s) => s.clear());
}

export async function storageUsage(): Promise<{ used: number; quota: number; downloadsBytes: number }> {
  const metas = await listDownloads();
  const downloadsBytes = metas.reduce((a, m) => a + (m.size ?? 0), 0);
  let used = downloadsBytes;
  let quota = 0;
  try {
    const est = await navigator.storage?.estimate?.();
    used = est?.usage ?? used;
    quota = est?.quota ?? 0;
  } catch {
    /* ignore */
  }
  return { used, quota, downloadsBytes };
}

// ───────────── offline progress queue ─────────────

export async function queueProgress(entry: PendingProgress): Promise<void> {
  const existing = await tx<PendingProgress | undefined>(STORE_PROGRESS, "readonly", (s) => s.get(entry.contentId));
  if (existing && existing.clientUpdatedAt > entry.clientUpdatedAt) return; // keep newest only
  await tx(STORE_PROGRESS, "readwrite", (s) => s.put(entry));
}

export async function pendingProgress(): Promise<PendingProgress[]> {
  return tx<PendingProgress[]>(STORE_PROGRESS, "readonly", (s) => s.getAll() as IDBRequest<PendingProgress[]>);
}

export async function clearPendingProgress(contentId: string): Promise<void> {
  await tx(STORE_PROGRESS, "readwrite", (s) => s.delete(contentId));
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}
