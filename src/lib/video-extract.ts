// Browser-side extraction of the *real* content of a video file:
// a speech-optimised audio sample and evenly-spaced frames (slides / board work).
// These are what the server sends to the AI for genuine content analysis.

export interface Extraction {
  durationSeconds: number;
  audioBase64?: string;
  audioFormat?: "wav";
  frames: string[];
  thumbnail?: Blob;
  warnings: string[];
}

const MAX_DECODE_BYTES = 350 * 1024 * 1024; // guard against OOM on huge files
const AUDIO_RATE = 8000; // speech is fully intelligible at 8 kHz
const SEGMENTS = 4;
const SEGMENT_SECONDS = 45;

function loadVideoElement(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as a video. Supported formats: MP4, WebM, MOV, MKV."));
    };
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    setTimeout(() => resolve(), 4000); // don't hang forever on odd codecs
    try {
      video.currentTime = Math.max(0, time);
    } catch (e) {
      reject(e);
    }
  });
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extractAudio(file: File, duration: number, warnings: string[]): Promise<Blob | undefined> {
  if (file.size > MAX_DECODE_BYTES) {
    warnings.push("The video is too large to decode audio in the browser — analysis used video frames only.");
    return undefined;
  }
  const Ctx: typeof AudioContext | undefined =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) {
    warnings.push("This browser cannot decode audio — analysis used video frames only.");
    return undefined;
  }
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctx({ sampleRate: AUDIO_RATE });
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const rate = decoded.sampleRate;
    const ch = decoded.getChannelData(0);
    const total = decoded.length;

    // Sample evenly-spaced windows across the whole video.
    const winLen = Math.min(Math.floor(SEGMENT_SECONDS * rate), total);
    const segs = Math.max(1, Math.min(SEGMENTS, Math.floor(total / Math.max(1, winLen))));
    const out = new Float32Array(winLen * segs);
    for (let s = 0; s < segs; s++) {
      const start = Math.floor((total - winLen) * (segs === 1 ? 0 : s / (segs - 1)));
      out.set(ch.subarray(start, start + winLen), s * winLen);
    }
    // Detect silence so we never pretend the AI heard something.
    let peak = 0;
    for (let i = 0; i < out.length; i += 37) peak = Math.max(peak, Math.abs(out[i]!));
    if (peak < 0.005) {
      warnings.push("The audio track is silent or extremely quiet — classification relies on the frames.");
      return undefined;
    }
    return encodeWav(out, rate);
  } catch (e) {
    warnings.push(
      `Audio could not be decoded from this file (${e instanceof Error ? e.message : "unknown error"}) — analysis used video frames only.`,
    );
    return undefined;
  } finally {
    try {
      await ctx?.close();
    } catch {
      /* ignore */
    }
    void duration;
  }
}

export async function extractVideoEvidence(
  file: File,
  onProgress?: (label: string, pct: number) => void,
): Promise<Extraction> {
  const warnings: string[] = [];
  const { video, url } = await loadVideoElement(file);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;

  const frames: string[] = [];
  let thumbnail: Blob | undefined;
  try {
    const canvas = document.createElement("canvas");
    const targetW = 640;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = duration ? (duration * (i + 0.5)) / count : 0;
      onProgress?.("Sampling video frames", Math.round(((i + 1) / count) * 45));
      await seek(video, t);
      const vw = video.videoWidth || targetW;
      const vh = video.videoHeight || Math.round((targetW * 9) / 16);
      const scale = Math.min(1, targetW / vw);
      canvas.width = Math.max(64, Math.round(vw * scale));
      canvas.height = Math.max(64, Math.round(vh * scale));
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) break;
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      if (dataUrl.length > 100) frames.push(dataUrl);
      if (i === Math.floor(count / 2)) {
        thumbnail = await new Promise<Blob | undefined>((res) =>
          canvas.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.8),
        );
      }
      // Yield to the event loop so the UI never freezes.
      await new Promise((r) => setTimeout(r, 0));
    }
    if (frames.length === 0) warnings.push("No frames could be read from this video.");
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
  }

  onProgress?.("Extracting audio for analysis", 60);
  const wav = await extractAudio(file, duration, warnings);
  onProgress?.("Preparing analysis payload", 85);
  const audioBase64 = wav ? await blobToBase64(wav) : undefined;

  return {
    durationSeconds: duration,
    audioBase64,
    audioFormat: wav ? "wav" : undefined,
    frames,
    thumbnail,
    warnings,
  };
}
