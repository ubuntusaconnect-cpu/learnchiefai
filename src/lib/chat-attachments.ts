// Client-side handling of AI Study Assistant attachments:
// validation → real text extraction where needed → secure upload to the private
// `chat-attachments` bucket. The bytes themselves are read by the server function.
import { uploadWithProgress } from "@/lib/storage-upload";

export const MAX_ATTACHMENT_BYTES = Number(
  (import.meta.env.VITE_MAX_ATTACHMENT_MB as string | undefined) ?? 25,
) * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const ACCEPTED_ATTACHMENTS =
  "image/jpeg,image/jpg,image/png,image/webp,application/pdf,text/plain,text/csv,text/markdown," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.md,.docx,.pptx,.xlsx";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const DOC_EXT = /\.(pdf|txt|csv|md|markdown|docx|pptx|xlsx)$/i;

export type AttachmentStatus = "preparing" | "uploading" | "processing" | "ready" | "failed";

export interface PendingAttachment {
  id: string;
  file: File;
  kind: "image" | "document";
  status: AttachmentStatus;
  progress: number;
  previewUrl?: string;
  storagePath?: string;
  extractedText?: string | null;
  error?: string;
  note?: string;
}

export function validateAttachment(file: File): string | null {
  const name = file.name;
  const type = (file.type || "").toLowerCase();
  if (file.size === 0) return `${name} is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`;
  }
  const okImage = IMAGE_EXT.test(name) && (type === "" || type.startsWith("image/"));
  const okDoc = DOC_EXT.test(name);
  if (!okImage && !okDoc) {
    return `${name} is not a supported file. Use JPG, PNG, WEBP, PDF, TXT, CSV, DOCX, PPTX or XLSX.`;
  }
  if (/\.(exe|sh|bat|cmd|com|msi|apk|dll|jar|js|php)$/i.test(name)) return `${name} is not allowed.`;
  return null;
}

export function attachmentKind(file: File): "image" | "document" {
  return IMAGE_EXT.test(file.name) || (file.type || "").startsWith("image/") ? "image" : "document";
}

/** Real text extraction for document formats the vision model cannot read directly. */
export async function extractAttachmentText(
  file: File,
): Promise<{ text: string | null; note?: string }> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const pdfjs: any = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
      }).promise;
      const chunks: string[] = [];
      for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        chunks.push(content.items.map((i: any) => i.str ?? "").join(" "));
      }
      const text = chunks.join("\n\n").replace(/[ \t]+/g, " ").trim();
      return {
        text: text || null,
        note: text
          ? undefined
          : "No selectable text in this PDF — it will be sent to the AI for visual document reading.",
      };
    } catch {
      return { text: null, note: "The PDF text layer could not be read; the file is sent for visual reading instead." };
    }
  }

  if (/\.docx$/.test(name)) {
    try {
      const mammoth: any = await import(/* @vite-ignore */ "mammoth/mammoth.browser" as string);
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { text: (value || "").trim() || null };
    } catch (e: any) {
      return { text: null, note: `This Word document could not be read: ${e?.message ?? e}` };
    }
  }

  if (/\.(pptx|xlsx)$/.test(name)) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const parts: string[] = [];
      const names = Object.keys(zip.files).filter((n) =>
        /ppt\/slides\/slide\d+\.xml$/.test(n) || /xl\/sharedStrings\.xml$/.test(n) || /xl\/worksheets\/sheet\d+\.xml$/.test(n),
      ).sort();
      for (const n of names) {
        const xml = await zip.files[n].async("string");
        const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text) parts.push(text);
      }
      const joined = parts.join("\n\n").slice(0, 120000);
      return { text: joined || null, note: joined ? undefined : "No readable text was found in this file." };
    } catch (e: any) {
      return { text: null, note: `This Office file could not be read: ${e?.message ?? e}` };
    }
  }

  if (/^text\//.test(type) || /\.(txt|csv|md|markdown)$/.test(name)) {
    const text = (await file.text()).slice(0, 120000).trim();
    return { text: text || null, note: text ? undefined : "This file is empty." };
  }

  return { text: null };
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90);
}

/** Uploads one attachment into the student's own folder and returns its storage path. */
export async function uploadAttachment(
  userId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
  const { promise } = uploadWithProgress("chat-attachments", path, file, (pct) => onProgress?.(pct));
  return await promise;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
