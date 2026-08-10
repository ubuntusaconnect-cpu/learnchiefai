import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Uploads a file to Storage with real byte-level progress (XHR — the JS client
 * gives no progress events). Large files stream straight from disk.
 */
export function uploadWithProgress(
  bucket: string,
  path: string,
  file: File | Blob,
  onProgress?: (pct: number, sent: number, total: number) => void,
): { promise: Promise<string>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    if (!SUPABASE_URL) throw new Error("Storage is not configured: VITE_SUPABASE_URL is missing.");

    return await new Promise<string>((resolve, reject) => {
      xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", PUBLISHABLE_KEY);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", (file as File).type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(path);
        else reject(new Error(`Upload failed [${xhr.status}]: ${xhr.responseText?.slice(0, 300) || "storage rejected the file"}`));
      };
      xhr.onerror = () => reject(new Error("Upload failed: the network connection was lost."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));
      xhr.send(file);
    });
  })();
  return { promise, abort: () => xhr.abort() };
}
