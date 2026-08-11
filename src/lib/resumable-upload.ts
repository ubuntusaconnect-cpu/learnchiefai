import { supabase } from "@/integrations/supabase/client";
import * as tus from "tus-js-client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ResumableHandle {
  promise: Promise<string>;
  pause: () => void;
  resume: () => void;
  abort: () => void;
}

/**
 * True resumable upload against Storage's TUS endpoint. Interrupted uploads
 * continue from the last acknowledged chunk instead of restarting, and failed
 * chunks are retried automatically with backoff.
 */
export function resumableUpload(opts: {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  onProgress?: (pct: number, sent: number, total: number) => void;
}): ResumableHandle {
  let upload: tus.Upload | null = null;
  let aborted = false;

  const promise = new Promise<string>((resolve, reject) => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      if (!SUPABASE_URL) throw new Error("Storage is not configured.");

      upload = new tus.Upload(opts.file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024, // Storage requires exactly 6MB chunks
        metadata: {
          bucketName: opts.bucket,
          objectName: opts.path,
          contentType: opts.contentType || (opts.file as File).type || "application/octet-stream",
          cacheControl: "3600",
        },
        onProgress: (sent, total) => opts.onProgress?.(Math.round((sent / total) * 100), sent, total),
        onError: (err) => reject(new Error(interpret(err))),
        onSuccess: () => resolve(opts.path),
      });

      const previous = await upload.findPreviousUploads();
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]!);
      if (!aborted) upload.start();
    })().catch(reject);
  });

  return {
    promise,
    pause: () => upload?.abort(),
    resume: () => upload?.start(),
    abort: () => {
      aborted = true;
      void upload?.abort(true);
    },
  };
}

function interpret(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/failed to fetch|network/i.test(msg)) return "Upload interrupted — the connection was lost. It will resume from where it stopped.";
  if (/401|403/.test(msg)) return "Upload rejected: your session or permissions are not valid for this bucket.";
  if (/413|too large/i.test(msg)) return "This file is larger than the storage limit for the bucket.";
  return `Upload failed: ${msg}`;
}
