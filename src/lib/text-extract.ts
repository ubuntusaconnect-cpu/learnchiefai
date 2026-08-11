// Browser-side evidence extraction: checksums + real document text.
// Runs entirely on the admin's device before anything is uploaded.

/** Streaming SHA-256 of the whole file (Web Crypto, chunked so large files don't blow memory). */
export async function sha256File(file: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  // Web Crypto has no incremental digest, so hash in one pass but read in chunks
  // into a single buffer only when the file is small; otherwise use a rolling
  // digest over chunk hashes (still deterministic for duplicate detection).
  const SMALL = 64 * 1024 * 1024;
  if (file.size <= SMALL) {
    const buf = await file.arrayBuffer();
    onProgress?.(100);
    return toHex(await crypto.subtle.digest("SHA-256", buf));
  }
  const CHUNK = 8 * 1024 * 1024;
  const parts: Uint8Array[] = [];
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + CHUNK, file.size));
    const digest = await crypto.subtle.digest("SHA-256", await slice.arrayBuffer());
    parts.push(new Uint8Array(digest));
    offset += CHUNK;
    onProgress?.(Math.round((offset / file.size) * 100));
  }
  const joined = new Uint8Array(parts.length * 32);
  parts.forEach((p, i) => joined.set(p, i * 32));
  return toHex(await crypto.subtle.digest("SHA-256", joined));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalised content fingerprint — catches reformatted/renamed copies of the same text. */
export async function textFingerprint(text: string): Promise<string | null> {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalised.length < 200) return null;
  const enc = new TextEncoder().encode(normalised.slice(0, 40000));
  return toHex(await crypto.subtle.digest("SHA-256", enc as unknown as ArrayBuffer));
}

export interface ExtractResult {
  text: string | null;
  pages?: number;
  durationSeconds?: number | null;
  note?: string;
}

/** Reads real text out of PDFs, plain text, markdown, CSV and HTML files. */
export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const type = file.type || "";

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const pdfjs: any = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const maxPages = Math.min(doc.numPages, 25);
      const chunks: string[] = [];
      for (let p = 1; p <= maxPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        chunks.push(content.items.map((i: any) => i.str ?? "").join(" "));
      }
      const text = chunks.join("\n\n").replace(/\s+\n/g, "\n").trim();
      return {
        text: text || null,
        pages: doc.numPages,
        note: text ? undefined : "This PDF contains no selectable text (likely a scan), so classification uses the filename only.",
      };
    } catch (e: any) {
      return { text: null, note: `Text could not be read from this PDF: ${e?.message ?? e}` };
    }
  }

  if (/^text\//.test(type) || /\.(txt|md|markdown|csv|html?|json|srt|vtt)$/.test(name)) {
    const text = (await file.text()).slice(0, 200000);
    return { text: text.trim() || null };
  }

  if (/^video\//.test(type) || /^audio\//.test(type)) {
    const duration = await mediaDuration(file);
    return { text: null, durationSeconds: duration, note: "Media file — classified from filename, metadata and duration." };
  }

  if (/^image\//.test(type)) {
    return { text: null, note: "Image file — classified from the filename." };
  }

  if (/\.(docx?|pptx?|xlsx?)$/.test(name)) {
    return { text: null, note: "Office document — classified from the filename. Export to PDF for full content analysis." };
  }

  return { text: null, note: "Unrecognised file type — classified from the filename." };
}

/** Reads duration from a media file without uploading it. */
export function mediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const isVideo = (file.type || "").startsWith("video/");
    const el = document.createElement(isVideo ? "video" : "audio");
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
    setTimeout(() => done(null), 8000);
  });
}

export function bucketForFile(file: File): string {
  return (file.type || "").startsWith("video/") ? "learning-videos" : "content-library";
}

export function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.size === 0) return false;
  return (
    /^(video|audio|image|text)\//.test(file.type || "") ||
    file.type === "application/pdf" ||
    /\.(pdf|txt|md|markdown|csv|html?|docx?|pptx?|xlsx?|mp4|mov|mkv|webm|m4v|mp3|m4a|wav|ogg|png|jpe?g|webp|svg)$/.test(name)
  );
}
