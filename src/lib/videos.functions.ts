import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AnalyzeInput = z.object({
  contentId: z.string().uuid(),
  audioBase64: z.string().optional(),
  audioFormat: z.enum(["wav", "webm", "m4a", "mp3", "ogg"]).optional(),
  frames: z.array(z.string()).max(10).optional(),
  durationSeconds: z.number().nonnegative().optional(),
  filename: z.string().optional(),
});

/** Real AI analysis of the uploaded video's audio + frames. Admin only. */
export const analyzeVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, lowConfidence } = await import("./videos.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("learning_content")
      .update({ status: "ai_analyzing", error_message: null })
      .eq("id", data.contentId);

    try {
      const { analyzeEducationalVideo } = await import("./video-ai.server");
      const a = await analyzeEducationalVideo({
        filename: data.filename,
        durationSeconds: data.durationSeconds,
        audioBase64: data.audioBase64,
        audioFormat: data.audioFormat,
        frames: data.frames,
      });

      const needs = lowConfidence(a.confidence) || !a.grade || !a.subject || !a.topic;

      const { data: row, error } = await supabaseAdmin
        .from("learning_content")
        .update({
          status: "awaiting_review",
          title: a.title,
          description: a.description,
          grade: a.grade,
          subject: a.subject,
          section: a.section,
          topic: a.topic,
          subtopic: a.subtopic,
          keywords: a.keywords,
          search_tags: a.search_tags,
          objectives: a.objectives,
          transcript: a.transcript || null,
          thumbnail_suggestion: a.thumbnail_suggestion || null,
          duration_seconds: data.durationSeconds ? Math.round(data.durationSeconds) : null,
          confidence: a.confidence,
          needs_confirmation: needs,
          ai_analysis: { model: a.model, reasoning: a.reasoning ?? null, analysed_at: new Date().toISOString() },
          error_message: null,
        })
        .eq("id", data.contentId)
        .select("id, status, title, description, grade, subject, section, topic, subtopic, keywords, search_tags, objectives, transcript, duration_seconds, file_path, thumbnail_path, thumbnail_suggestion, confidence, needs_confirmation, ai_analysis, error_message, original_filename, published_at, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true as const, content: row };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("learning_content")
        .update({ status: "failed", error_message: message.slice(0, 1000) })
        .eq("id", data.contentId);
      throw new Error(message);
    }
  });

const PublishInput = z.object({
  contentId: z.string().uuid(),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  grade: z.number().int().min(1).max(12),
  subject: z.string().min(1),
  section: z.string().optional().nullable(),
  topic: z.string().optional().nullable(),
  subtopic: z.string().optional().nullable(),
  keywords: z.array(z.string()).default([]),
  search_tags: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
});

/** Approve & publish: files the video into the curriculum tree. Admin only. */
export const publishVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, ensureCurriculumPath } = await import("./videos.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("learning_content")
      .select("file_path")
      .eq("id", data.contentId)
      .single();
    if (readErr) throw new Error(readErr.message);
    if (!existing?.file_path) throw new Error("This item has no stored video file, so it cannot be published.");

    const nodeId = await ensureCurriculumPath({
      grade: data.grade,
      subject: data.subject,
      section: data.section ?? null,
      topic: data.topic ?? null,
      subtopic: data.subtopic ?? null,
    });

    const { data: row, error } = await supabaseAdmin
      .from("learning_content")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        needs_confirmation: false,
        error_message: null,
        curriculum_node_id: nodeId,
        title: data.title,
        description: data.description ?? null,
        grade: data.grade,
        subject: data.subject,
        section: data.section ?? null,
        topic: data.topic ?? null,
        subtopic: data.subtopic ?? null,
        keywords: data.keywords,
        search_tags: data.search_tags,
        objectives: data.objectives,
      })
      .eq("id", data.contentId)
      .select("id, status, title, description, grade, subject, section, topic, subtopic, keywords, search_tags, objectives, transcript, duration_seconds, file_path, thumbnail_path, thumbnail_suggestion, confidence, needs_confirmation, ai_analysis, error_message, original_filename, published_at, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, content: row };
  });

const StatusInput = z.object({
  contentId: z.string().uuid(),
  status: z.enum(["awaiting_review", "published", "failed", "processing"]),
});

export const setContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./videos.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { status: string; published_at?: string | null } = { status: data.status };
    if (data.status === "published") patch.published_at = new Date().toISOString();
    if (data.status === "awaiting_review") patch.published_at = null;
    const { error } = await supabaseAdmin.from("learning_content").update(patch).eq("id", data.contentId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
