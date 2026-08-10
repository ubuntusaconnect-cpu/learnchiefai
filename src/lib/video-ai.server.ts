// Server-only. Real multimodal analysis of uploaded educational videos.
// Uses the Lovable AI Gateway (Gemini) with the video's extracted audio track
// plus sampled video frames (slides / on-screen text / diagrams).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELS = ["google/gemini-3.6-flash", "google/gemini-3.5-flash"];

export interface AnalysisInput {
  filename?: string;
  durationSeconds?: number;
  audioBase64?: string;
  audioFormat?: string; // wav | webm | m4a | mp3
  frames?: string[]; // data URLs (image/jpeg)
}

export interface VideoAnalysis {
  title: string;
  grade: number | null;
  subject: string | null;
  section: string | null;
  topic: string | null;
  subtopic: string | null;
  description: string;
  objectives: string[];
  keywords: string[];
  search_tags: string[];
  thumbnail_suggestion: string;
  transcript: string;
  confidence: Record<string, number>;
  reasoning?: string;
  model: string;
}

/** Compact curriculum tree the model must classify against. */
async function curriculumOutline(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("curriculum_nodes")
    .select("id, parent_id, kind, name")
    .limit(5000);
  if (error) throw new Error(`Could not load the curriculum structure: ${error.message}`);
  const rows = data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const nameOf = (id: string | null) => (id ? byId.get(id)?.name ?? null : null);

  // subject -> section -> topic -> subtopics (grade-independent, deduped)
  const tree: Record<string, Record<string, Record<string, Set<string>>>> = {};
  for (const r of rows) {
    if (r.kind === "subject") (tree[r.name] ??= {});
  }
  for (const r of rows) {
    if (r.kind !== "section") continue;
    const subj = nameOf(r.parent_id);
    if (!subj) continue;
    ((tree[subj] ??= {})[r.name] ??= {});
  }
  for (const r of rows) {
    if (r.kind !== "topic") continue;
    const sec = byId.get(r.parent_id ?? "");
    const subj = sec ? nameOf(sec.parent_id) : null;
    if (!sec || !subj) continue;
    (((tree[subj] ??= {})[sec.name] ??= {})[r.name] ??= new Set());
  }
  for (const r of rows) {
    if (r.kind !== "subtopic") continue;
    const top = byId.get(r.parent_id ?? "");
    const sec = top ? byId.get(top.parent_id ?? "") : null;
    const subj = sec ? nameOf(sec.parent_id) : null;
    if (!top || !sec || !subj) continue;
    (((tree[subj] ??= {})[sec.name] ??= {})[top.name] ??= new Set()).add(r.name);
  }

  const lines: string[] = [];
  for (const [subj, sections] of Object.entries(tree)) {
    lines.push(`- ${subj}`);
    for (const [sec, topics] of Object.entries(sections)) {
      lines.push(`  - ${sec}`);
      for (const [top, subs] of Object.entries(topics)) {
        lines.push(`    - ${top}${subs.size ? `: ${[...subs].join(", ")}` : ""}`);
      }
    }
  }
  return lines.join("\n");
}

const SYSTEM = `You are Learn Chief's curriculum classification engine for South African CAPS education (Grades 9-12).

You receive the ACTUAL CONTENT of an educational video: its audio track (teacher speech) and sampled video frames (slides, board work, diagrams, on-screen text).

Your job:
1. Transcribe / read what is actually being taught. Ignore the filename — it is only a weak hint and is often meaningless (e.g. "video123.mp4").
2. Classify the content against the supplied curriculum structure: Grade -> Subject -> Section -> Topic -> Subtopic. Prefer EXACT names from the structure. Only invent a name when nothing in the structure fits, and then lower your confidence.
3. Produce publication-quality metadata a learner would search for.
4. Give an honest integer confidence (0-100) per classification field. If the audio is unclear, silent, or the content is not educational, use LOW confidence and say so in "reasoning". Never guess with high confidence.

Return ONLY a JSON object (no markdown fences) with exactly these keys:
{
  "title": string,                       // clear learner-facing title, e.g. "Newton's Second Law Explained"
  "grade": number|null,                  // 9, 10, 11 or 12
  "subject": string|null,
  "section": string|null,
  "topic": string|null,
  "subtopic": string|null,
  "description": string,                 // 2-4 sentences describing what the video teaches
  "objectives": string[],                // 3-6 learning objectives
  "keywords": string[],                  // 5-12 curriculum keywords/terms actually used
  "search_tags": string[],               // 5-12 extra search phrases learners might type
  "thumbnail_suggestion": string,        // which moment/visual makes the best thumbnail
  "transcript": string,                  // best-effort transcript of the spoken content (may be long)
  "confidence": { "grade": number, "subject": number, "section": number, "topic": number, "subtopic": number },
  "reasoning": string                    // 1-3 sentences on the evidence used
}`;

function extractJson(text: string): any {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The AI response was not valid JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
function strArr(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()).slice(0, max);
}

export async function analyzeEducationalVideo(input: AnalysisInput): Promise<VideoAnalysis> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "AI video analysis is not configured: the LOVABLE_API_KEY environment variable is missing on the server.",
    );
  }
  if (!input.audioBase64 && !(input.frames && input.frames.length)) {
    throw new Error(
      "No analysable content was extracted from this video (no audio track and no readable frames). Please retry or upload a different format.",
    );
  }

  const outline = await curriculumOutline();

  const content: any[] = [
    {
      type: "text",
      text: [
        `CURRICULUM STRUCTURE (classify against this):\n${outline}`,
        ``,
        `VIDEO FACTS: duration ${input.durationSeconds ? Math.round(input.durationSeconds) + "s" : "unknown"}; original filename "${input.filename ?? "unknown"}" (weak hint only).`,
        input.audioBase64
          ? `The attached audio is sampled from across the whole video (mono, speech-optimised).`
          : `NOTE: the audio track could not be decoded — classify from the frames and lower your confidence accordingly.`,
        input.frames?.length
          ? `${input.frames.length} frames sampled evenly across the video are attached in chronological order.`
          : `NOTE: no frames could be sampled.`,
        ``,
        `Analyse the real content and return the JSON object.`,
      ].join("\n"),
    },
  ];

  if (input.audioBase64) {
    content.push({
      type: "input_audio",
      input_audio: { data: input.audioBase64, format: input.audioFormat || "wav" },
    });
  }
  for (const f of input.frames ?? []) {
    content.push({ type: "image_url", image_url: { url: f } });
  }

  let lastError: Error | null = null;
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI gateway error [${res.status}] on ${model}: ${body.slice(0, 500)}`);
      }
      const json: any = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error(`The AI returned an empty response (${model}).`);
      const raw = extractJson(text);

      const analysis: VideoAnalysis = {
        title: String(raw.title ?? "").trim(),
        grade: raw.grade == null ? null : Number(raw.grade),
        subject: raw.subject ? String(raw.subject).trim() : null,
        section: raw.section ? String(raw.section).trim() : null,
        topic: raw.topic ? String(raw.topic).trim() : null,
        subtopic: raw.subtopic ? String(raw.subtopic).trim() : null,
        description: String(raw.description ?? "").trim(),
        objectives: strArr(raw.objectives, 8),
        keywords: strArr(raw.keywords, 15),
        search_tags: strArr(raw.search_tags, 15),
        thumbnail_suggestion: String(raw.thumbnail_suggestion ?? "").trim(),
        transcript: String(raw.transcript ?? "").trim(),
        confidence: {
          grade: num(raw.confidence?.grade),
          subject: num(raw.confidence?.subject),
          section: num(raw.confidence?.section),
          topic: num(raw.confidence?.topic),
          subtopic: num(raw.confidence?.subtopic),
        },
        reasoning: raw.reasoning ? String(raw.reasoning) : undefined,
        model,
      };
      if (!analysis.title || !analysis.description) {
        throw new Error("The AI analysis was incomplete (missing title or description).");
      }

      await supabaseAdmin.from("ai_request_logs").insert({
        provider: "lovable",
        model,
        operation: "video-analysis",
        status: "success",
        duration_ms: Date.now() - started,
        cached: false,
      });

      return analysis;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      await supabaseAdmin.from("ai_request_logs").insert({
        provider: "lovable",
        model,
        operation: "video-analysis",
        status: "error",
        duration_ms: Date.now() - started,
        cached: false,
        error: lastError.message.slice(0, 800),
      });
    }
  }
  throw lastError ?? new Error("AI video analysis failed.");
}
