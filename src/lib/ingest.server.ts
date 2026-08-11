// Server-only helpers for the intelligent content ingestion pipeline.
// Never import this from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CONTENT_TYPES = [
  "lesson",
  "notes",
  "worksheet",
  "question_paper",
  "memo",
  "video",
  "audio",
  "image",
  "document",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const PAPER_TYPES: ContentType[] = ["question_paper", "memo"];

export interface Classification {
  contentType: ContentType;
  title: string;
  description: string;
  grade: number | null;
  subject: string | null;
  section: string | null;
  topic: string | null;
  subtopic: string | null;
  chapter: string | null;
  term: number | null;
  year: number | null;
  paperNumber: number | null;
  examType: string | null;
  language: string | null;
  difficulty: string | null;
  keywords: string[];
  curriculumRelevance: string | null;
  confidence: Record<string, number>;
  reasoning?: string;
}

const CLASSIFY_SYSTEM = `You are Learn Chief's content classification engine for South African CAPS education (Grades 8-12) plus coding/robotics/engineering skills.

You receive a filename plus (when available) real extracted text from the document, or metadata from a media file. Classify the material by what it ACTUALLY contains. If the filename disagrees with the content, trust the content.

Return STRICT JSON only (no markdown, no prose) with exactly these keys:
{
  "contentType": one of "lesson","notes","worksheet","question_paper","memo","video","audio","image","document",
  "title": short human title (max 120 chars),
  "description": 1-3 sentence learner-facing description,
  "grade": integer 8-12 or null,
  "subject": full CAPS subject name (e.g. "Physical Sciences", "Mathematics") or null,
  "section": broad section/strand (e.g. "Mechanics", "Algebra") or null,
  "topic": specific topic (e.g. "Newton's Laws") or null,
  "subtopic": narrower subtopic or null,
  "chapter": chapter/unit label or null,
  "term": integer 1-4 or null,
  "year": 4-digit exam/publication year or null,
  "paperNumber": integer (1,2,3) for exam papers or null,
  "examType": "Final Examination" | "Mid-Year Examination" | "Trial Examination" | "Controlled Test" | "Class Test" | null,
  "language": e.g. "English", "Afrikaans" or null,
  "difficulty": "foundation" | "intermediate" | "advanced" | null,
  "keywords": array of 5-12 lowercase keywords,
  "curriculumRelevance": one sentence on where this fits in CAPS, or null,
  "confidence": object with integer 0-100 percentages for the keys "grade","subject","topic","contentType","overall",
  "reasoning": one short sentence explaining the decision
}

Rules:
- "memo" means a marking guideline / memorandum / answer key.
- "question_paper" means an exam, test or question paper.
- Never invent a grade, subject or topic you cannot support: use null and a low confidence instead.
- Confidence must honestly reflect the evidence you had.`;

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? Math.round(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseJsonLoose(raw: string): any {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The AI returned a response that could not be read as classification data.");
  }
}

function normaliseClassification(obj: any, fallbackTitle: string): Classification {
  const type = CONTENT_TYPES.includes(obj?.contentType) ? (obj.contentType as ContentType) : "document";
  const conf = obj?.confidence ?? {};
  const confidence: Record<string, number> = {};
  for (const k of ["grade", "subject", "topic", "contentType", "overall"]) {
    const n = clampInt(conf[k], 0, 100);
    confidence[k] = n ?? 0;
  }
  if (!confidence.overall) {
    const vals = [confidence.grade, confidence.subject, confidence.topic, confidence.contentType];
    confidence.overall = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return {
    contentType: type,
    title: String(obj?.title ?? fallbackTitle).slice(0, 160) || fallbackTitle,
    description: String(obj?.description ?? "").slice(0, 1200),
    grade: clampInt(obj?.grade, 8, 12),
    subject: obj?.subject ? String(obj.subject).slice(0, 120) : null,
    section: obj?.section ? String(obj.section).slice(0, 120) : null,
    topic: obj?.topic ? String(obj.topic).slice(0, 160) : null,
    subtopic: obj?.subtopic ? String(obj.subtopic).slice(0, 160) : null,
    chapter: obj?.chapter ? String(obj.chapter).slice(0, 120) : null,
    term: clampInt(obj?.term, 1, 4),
    year: clampInt(obj?.year, 1990, new Date().getFullYear() + 1),
    paperNumber: clampInt(obj?.paperNumber, 1, 4),
    examType: obj?.examType ? String(obj.examType).slice(0, 80) : null,
    language: obj?.language ? String(obj.language).slice(0, 40) : null,
    difficulty: obj?.difficulty ? String(obj.difficulty).slice(0, 30) : null,
    keywords: Array.isArray(obj?.keywords)
      ? obj.keywords.slice(0, 16).map((k: unknown) => String(k).toLowerCase().slice(0, 60))
      : [],
    curriculumRelevance: obj?.curriculumRelevance ? String(obj.curriculumRelevance).slice(0, 400) : null,
    confidence,
    reasoning: obj?.reasoning ? String(obj.reasoning).slice(0, 400) : undefined,
  };
}

/** Runs real AI classification against the filename plus extracted evidence. */
export async function classifyEvidence(input: {
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  extractedText?: string | null;
  userId?: string | null;
}): Promise<Classification> {
  const { aiChat } = await import("./ai-gateway.server");

  const evidence: string[] = [`Filename: ${input.filename}`];
  if (input.mimeType) evidence.push(`MIME type: ${input.mimeType}`);
  if (input.sizeBytes) evidence.push(`Size: ${(input.sizeBytes / 1_048_576).toFixed(2)} MB`);
  if (input.durationSeconds) evidence.push(`Media duration: ${Math.round(input.durationSeconds)}s`);
  const text = (input.extractedText ?? "").trim();
  if (text) {
    evidence.push(`\n--- BEGIN EXTRACTED DOCUMENT TEXT ---\n${text.slice(0, 18000)}\n--- END EXTRACTED DOCUMENT TEXT ---`);
  } else {
    evidence.push("\nNo text could be extracted from this file. Classify from the filename and media metadata only, and lower your confidence accordingly.");
  }

  const result = await aiChat(
    [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: evidence.join("\n") },
    ],
    { operation: "content-classify", cache: true, userId: input.userId ?? null, temperature: 0.1, maxTokens: 1600 },
  );

  const fallbackTitle = input.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return normaliseClassification(parseJsonLoose(result.content), fallbackTitle || input.filename);
}

// ────────────────────────────── duplicates ──────────────────────────────

export interface DuplicateMatch {
  kind: "exact_file" | "same_text" | "similar_title";
  score: number;
  target: "learning_content" | "question_papers";
  id: string;
  title: string;
  path: string | null;
  location: string;
}

function locationLabel(row: any): string {
  const parts = [
    row.grade ? `Grade ${row.grade}` : null,
    row.subject ?? null,
    row.section ?? null,
    row.topic ?? null,
    row.subtopic ?? null,
  ].filter(Boolean);
  return parts.length ? parts.join(" → ") : "Unfiled";
}

/** Multi-signal duplicate detection: file checksum, then text fingerprint, then title+metadata. */
export async function findDuplicate(input: {
  sha256?: string | null;
  textHash?: string | null;
  title?: string | null;
  grade?: number | null;
  subject?: string | null;
}): Promise<DuplicateMatch | null> {
  if (input.sha256) {
    const { data } = await supabaseAdmin
      .from("learning_content")
      .select("id, title, file_path, grade, subject, section, topic, subtopic")
      .eq("sha256", input.sha256)
      .limit(1);
    if (data?.length) {
      const r = data[0]!;
      return { kind: "exact_file", score: 100, target: "learning_content", id: r.id, title: r.title, path: r.file_path, location: locationLabel(r) };
    }
    const { data: paper } = await supabaseAdmin
      .from("question_papers")
      .select("id, title, paper_path, grade, subject")
      .or(`sha256.eq.${input.sha256},memo_sha256.eq.${input.sha256}`)
      .limit(1);
    if (paper?.length) {
      const r = paper[0]!;
      return { kind: "exact_file", score: 100, target: "question_papers", id: r.id, title: r.title, path: r.paper_path, location: locationLabel(r) };
    }
  }

  if (input.textHash) {
    const { data } = await supabaseAdmin
      .from("learning_content")
      .select("id, title, file_path, grade, subject, section, topic, subtopic")
      .eq("text_hash", input.textHash)
      .limit(1);
    if (data?.length) {
      const r = data[0]!;
      return { kind: "same_text", score: 95, target: "learning_content", id: r.id, title: r.title, path: r.file_path, location: locationLabel(r) };
    }
  }

  if (input.title && input.title.length > 8) {
    const { data } = await supabaseAdmin
      .from("learning_content")
      .select("id, title, file_path, grade, subject, section, topic, subtopic")
      .ilike("title", input.title.slice(0, 60))
      .limit(1);
    if (data?.length) {
      const r = data[0]!;
      const sameGrade = !input.grade || !r.grade || r.grade === input.grade;
      if (sameGrade) {
        return { kind: "similar_title", score: 70, target: "learning_content", id: r.id, title: r.title, path: r.file_path, location: locationLabel(r) };
      }
    }
  }

  return null;
}

/** Threshold rule: below this the file goes to the AI review queue instead of publishing. */
export function needsReview(c: Classification): boolean {
  if (!c.grade || !c.subject) return true;
  const conf = c.confidence ?? {};
  if ((conf.overall ?? 0) < 80) return true;
  return (conf.grade ?? 0) < 80 || (conf.subject ?? 0) < 80;
}

/** Records a version snapshot before content is replaced. */
export async function snapshotVersion(opts: {
  contentId?: string | null;
  paperId?: string | null;
  changedBy: string;
  note: string;
}) {
  if (opts.contentId) {
    const { data } = await supabaseAdmin.from("learning_content").select("*").eq("id", opts.contentId).maybeSingle();
    if (!data) return;
    await supabaseAdmin.from("content_versions").insert({
      content_id: opts.contentId,
      version: data.version ?? 1,
      file_path: data.file_path,
      bucket: data.bucket,
      sha256: data.sha256,
      snapshot: data as any,
      note: opts.note,
      changed_by: opts.changedBy,
    });
  } else if (opts.paperId) {
    const { data } = await supabaseAdmin.from("question_papers").select("*").eq("id", opts.paperId).maybeSingle();
    if (!data) return;
    await supabaseAdmin.from("content_versions").insert({
      paper_id: opts.paperId,
      version: data.version ?? 1,
      file_path: data.paper_path,
      bucket: "question-papers",
      sha256: data.sha256,
      snapshot: data as any,
      note: opts.note,
      changed_by: opts.changedBy,
    });
  }
}

/** Writes an admin audit trail entry for access to sensitive learner data. */
export async function audit(opts: {
  adminId: string;
  action: string;
  subjectUserId?: string | null;
  recordType?: string | null;
  recordId?: string | null;
  success?: boolean;
  detail?: string | null;
}) {
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: opts.adminId,
    action: opts.action,
    subject_user_id: opts.subjectUserId ?? null,
    record_type: opts.recordType ?? null,
    record_id: opts.recordId ?? null,
    success: opts.success ?? true,
    detail: opts.detail ?? null,
  });
}
