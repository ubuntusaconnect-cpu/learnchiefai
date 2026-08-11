import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(`Could not verify your permissions: ${error.message}`);
  if (data !== true) throw new Error("Forbidden: administrator access is required.");
}

// ── 1. Register the file, hash-check for duplicates before anything is stored ──
export const beginIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(400),
        mimeType: z.string().max(200).nullable().optional(),
        fileSize: z.number().int().nonnegative(),
        sha256: z.string().length(64),
        textHash: z.string().length(64).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findDuplicate } = await import("./ingest.server");

    // Same file already mid-pipeline? Reuse the job instead of creating a second one.
    const { data: existingJob } = await supabaseAdmin
      .from("content_uploads")
      .select("id, status, file_path, bucket")
      .eq("sha256", data.sha256)
      .neq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1);

    const duplicate = await findDuplicate({ sha256: data.sha256, textHash: data.textHash ?? null });

    if (existingJob?.length) {
      const job = existingJob[0]!;
      return { uploadId: job.id, resumed: true, alreadyUploaded: !!job.file_path, bucket: job.bucket, filePath: job.file_path, duplicate };
    }

    const { data: row, error } = await supabaseAdmin
      .from("content_uploads")
      .insert({
        uploaded_by: context.userId,
        original_filename: data.filename,
        mime_type: data.mimeType ?? null,
        file_size: data.fileSize,
        sha256: data.sha256,
        text_hash: data.textHash ?? null,
        stage: duplicate ? "duplicate_check" : "queued",
        status: duplicate ? "duplicate" : "pending",
        duplicate_kind: duplicate?.kind ?? null,
        duplicate_score: duplicate?.score ?? null,
        duplicate_of_content_id: duplicate?.target === "learning_content" ? duplicate.id : null,
        duplicate_of_paper_id: duplicate?.target === "question_papers" ? duplicate.id : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not start the upload job: ${error.message}`);
    return { uploadId: row.id, resumed: false, alreadyUploaded: false, bucket: null, filePath: null, duplicate };
  });

// ── 2. Record where the bytes landed in storage ──
export const attachUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ uploadId: uuid, bucket: z.string().min(1), filePath: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("content_uploads")
      .update({ bucket: data.bucket, file_path: data.filePath, stage: "stored", status: "processing", progress: 40 })
      .eq("id", data.uploadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── 3. Real AI classification from extracted evidence ──
export const classifyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        uploadId: uuid,
        extractedText: z.string().max(200000).nullable().optional(),
        durationSeconds: z.number().nonnegative().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { classifyEvidence, needsReview, findDuplicate } = await import("./ingest.server");

    const { data: job } = await supabaseAdmin
      .from("content_uploads")
      .select("*")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (!job) throw new Error("That upload job no longer exists.");

    await supabaseAdmin.from("content_uploads").update({ stage: "ai_analysing", status: "processing", progress: 60 }).eq("id", job.id);

    try {
      const classification = await classifyEvidence({
        filename: job.original_filename,
        mimeType: job.mime_type,
        sizeBytes: job.file_size,
        durationSeconds: data.durationSeconds ?? null,
        extractedText: data.extractedText ?? null,
        userId: context.userId,
      });

      const review = needsReview(classification);
      // Second duplicate pass now that we know the title/metadata.
      const duplicate =
        job.duplicate_kind
          ? null
          : await findDuplicate({
              sha256: job.sha256,
              textHash: job.text_hash,
              title: classification.title,
              grade: classification.grade,
              subject: classification.subject,
            });

      const destination = {
        grade: classification.grade,
        subject: classification.subject,
        section: classification.section,
        topic: classification.topic,
        subtopic: classification.subtopic,
        contentType: classification.contentType,
      };

      await supabaseAdmin
        .from("content_uploads")
        .update({
          ai_classification: classification as any,
          confidence: classification.confidence as any,
          overall_confidence: classification.confidence.overall ?? null,
          destination: destination as any,
          content_type: classification.contentType,
          extracted_text: (data.extractedText ?? "").slice(0, 100000) || null,
          needs_review: review,
          stage: review ? "awaiting_review" : "classified",
          status: duplicate ? "duplicate" : review ? "review" : "ready",
          progress: 85,
          error_message: null,
          ...(duplicate
            ? {
                duplicate_kind: duplicate.kind,
                duplicate_score: duplicate.score,
                duplicate_of_content_id: duplicate.target === "learning_content" ? duplicate.id : null,
                duplicate_of_paper_id: duplicate.target === "question_papers" ? duplicate.id : null,
              }
            : {}),
        })
        .eq("id", job.id);

      return { classification, needsReview: review, duplicate };
    } catch (e: any) {
      await supabaseAdmin
        .from("content_uploads")
        .update({ stage: "failed", status: "error", error_message: String(e?.message ?? e).slice(0, 800) })
        .eq("id", job.id);
      throw e;
    }
  });

const Overrides = z
  .object({
    contentType: z.string().max(40).optional(),
    title: z.string().max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    grade: z.number().int().min(8).max(12).nullable().optional(),
    subject: z.string().max(120).nullable().optional(),
    section: z.string().max(120).nullable().optional(),
    topic: z.string().max(160).nullable().optional(),
    subtopic: z.string().max(160).nullable().optional(),
    term: z.number().int().min(1).max(4).nullable().optional(),
    year: z.number().int().min(1990).max(2100).nullable().optional(),
    paperNumber: z.number().int().min(1).max(4).nullable().optional(),
    examType: z.string().max(80).nullable().optional(),
    language: z.string().max(40).nullable().optional(),
    difficulty: z.string().max(30).nullable().optional(),
    keywords: z.array(z.string().max(60)).max(20).optional(),
  })
  .partial();

// ── 4. Publish: create the real content record in the right curriculum place ──
export const publishUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        uploadId: uuid,
        overrides: Overrides.optional(),
        duplicateDecision: z.enum(["keep_both", "replace", "use_existing"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureCurriculumPath } = await import("./videos.server");
    const { snapshotVersion } = await import("./ingest.server");

    const { data: job } = await supabaseAdmin.from("content_uploads").select("*").eq("id", data.uploadId).maybeSingle();
    if (!job) throw new Error("That upload job no longer exists.");
    if (!job.file_path) throw new Error("This file has not finished uploading yet.");

    const ai = (job.ai_classification ?? {}) as any;
    const o = data.overrides ?? {};
    const merged = {
      contentType: (o.contentType ?? ai.contentType ?? "document") as string,
      title: o.title ?? ai.title ?? job.original_filename,
      description: o.description ?? ai.description ?? null,
      grade: o.grade ?? ai.grade ?? null,
      subject: o.subject ?? ai.subject ?? null,
      section: o.section ?? ai.section ?? null,
      topic: o.topic ?? ai.topic ?? null,
      subtopic: o.subtopic ?? ai.subtopic ?? null,
      term: o.term ?? ai.term ?? null,
      year: o.year ?? ai.year ?? null,
      paperNumber: o.paperNumber ?? ai.paperNumber ?? null,
      examType: o.examType ?? ai.examType ?? null,
      language: o.language ?? ai.language ?? null,
      difficulty: o.difficulty ?? ai.difficulty ?? null,
      keywords: o.keywords ?? ai.keywords ?? [],
    };

    if (!merged.grade || !merged.subject) {
      throw new Error("A grade and subject are required before this file can be published. Please complete the review fields.");
    }

    // Duplicate handling
    if (data.duplicateDecision === "use_existing") {
      await supabaseAdmin
        .from("content_uploads")
        .update({ status: "skipped", stage: "duplicate_skipped", duplicate_decision: "use_existing", progress: 100 })
        .eq("id", job.id);
      // Remove the redundant stored copy.
      if (job.bucket && job.file_path) await supabaseAdmin.storage.from(job.bucket).remove([job.file_path]);
      return { ok: true, action: "used_existing" as const, contentId: job.duplicate_of_content_id, paperId: job.duplicate_of_paper_id };
    }

    const isPaper = merged.contentType === "question_paper" || merged.contentType === "memo";

    if (isPaper) {
      const isMemo = merged.contentType === "memo";
      const year = merged.year ?? new Date().getFullYear();
      const term = merged.term ?? 4;

      // Link a memo onto the matching paper record when one exists.
      const { data: match } = await supabaseAdmin
        .from("question_papers")
        .select("id, version")
        .eq("grade", merged.grade)
        .eq("subject", merged.subject)
        .eq("year", year)
        .eq("term", term)
        .eq("paper_number", merged.paperNumber ?? 1)
        .limit(1);

      if (match?.length) {
        const target = match[0]!;
        if (data.duplicateDecision === "replace") {
          await snapshotVersion({ paperId: target.id, changedBy: context.userId, note: `Replaced by ${job.original_filename}` });
        }
        const patch = isMemo
          ? { memo_path: job.file_path, memo_sha256: job.sha256 }
          : { paper_path: job.file_path, sha256: job.sha256 };
        await supabaseAdmin
          .from("question_papers")
          .update({ ...patch, version: (target.version ?? 1) + (data.duplicateDecision === "replace" ? 1 : 0) })
          .eq("id", target.id);
        await supabaseAdmin
          .from("content_uploads")
          .update({ status: "published", stage: "published", progress: 100, published_paper_id: target.id, duplicate_decision: data.duplicateDecision ?? null })
          .eq("id", job.id);
        return { ok: true, action: "attached_to_paper" as const, paperId: target.id };
      }

      const { data: created, error } = await supabaseAdmin
        .from("question_papers")
        .insert({
          title: merged.title,
          grade: merged.grade,
          subject: merged.subject,
          term,
          year,
          paper_number: merged.paperNumber,
          exam_type: merged.examType,
          description: merged.description,
          uploaded_by: context.userId,
          ...(isMemo
            ? { memo_path: job.file_path, memo_sha256: job.sha256 }
            : { paper_path: job.file_path, sha256: job.sha256 }),
        })
        .select("id")
        .single();
      if (error) throw new Error(`Could not save the question paper: ${error.message}`);
      await supabaseAdmin
        .from("content_uploads")
        .update({ status: "published", stage: "published", progress: 100, published_paper_id: created.id, duplicate_decision: data.duplicateDecision ?? null })
        .eq("id", job.id);
      return { ok: true, action: "created_paper" as const, paperId: created.id };
    }

    const nodeId = await ensureCurriculumPath({
      grade: merged.grade,
      subject: merged.subject,
      section: merged.section,
      topic: merged.topic,
      subtopic: merged.subtopic,
    });

    // Replace flow: version the existing row and point it at the new file.
    if (data.duplicateDecision === "replace" && job.duplicate_of_content_id) {
      await snapshotVersion({ contentId: job.duplicate_of_content_id, changedBy: context.userId, note: `Replaced by ${job.original_filename}` });
      const { data: prev } = await supabaseAdmin
        .from("learning_content")
        .select("version")
        .eq("id", job.duplicate_of_content_id)
        .maybeSingle();
      const { error } = await supabaseAdmin
        .from("learning_content")
        .update({
          file_path: job.file_path,
          bucket: job.bucket,
          sha256: job.sha256,
          text_hash: job.text_hash,
          file_size: job.file_size,
          mime_type: job.mime_type,
          original_filename: job.original_filename,
          version: (prev?.version ?? 1) + 1,
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", job.duplicate_of_content_id);
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("content_uploads")
        .update({ status: "published", stage: "published", progress: 100, published_content_id: job.duplicate_of_content_id, duplicate_decision: "replace" })
        .eq("id", job.id);
      return { ok: true, action: "replaced" as const, contentId: job.duplicate_of_content_id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("learning_content")
      .insert({
        content_type: merged.contentType,
        status: "published",
        title: merged.title,
        description: merged.description,
        grade: merged.grade,
        subject: merged.subject,
        section: merged.section,
        topic: merged.topic,
        subtopic: merged.subtopic,
        curriculum_node_id: nodeId,
        keywords: merged.keywords,
        search_tags: merged.keywords,
        language: merged.language,
        difficulty: merged.difficulty,
        term: merged.term,
        year: merged.year,
        paper_number: merged.paperNumber,
        exam_type: merged.examType,
        file_path: job.file_path,
        bucket: job.bucket,
        file_size: job.file_size,
        mime_type: job.mime_type,
        sha256: job.sha256,
        text_hash: job.text_hash,
        extracted_text: job.extracted_text,
        ai_analysis: job.ai_classification,
        confidence: job.confidence,
        needs_confirmation: false,
        original_filename: job.original_filename,
        uploaded_by: context.userId,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not save the content: ${error.message}`);

    await supabaseAdmin
      .from("content_uploads")
      .update({
        status: "published",
        stage: "published",
        progress: 100,
        published_content_id: created.id,
        duplicate_decision: data.duplicateDecision ?? null,
      })
      .eq("id", job.id);

    return { ok: true, action: "created" as const, contentId: created.id };
  });

// ── Upload job queue (review area) ──
export const listUploadJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().max(30).nullable().optional(), limit: z.number().int().min(1).max(300).default(100) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("content_uploads").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateUploadJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ uploadId: uuid, overrides: Overrides }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("content_uploads").select("ai_classification").eq("id", data.uploadId).maybeSingle();
    if (!job) throw new Error("That upload job no longer exists.");
    const merged = { ...((job.ai_classification ?? {}) as any), ...data.overrides };
    const { error } = await supabaseAdmin
      .from("content_uploads")
      .update({ ai_classification: merged, content_type: merged.contentType ?? null, destination: {
        grade: merged.grade ?? null, subject: merged.subject ?? null, section: merged.section ?? null,
        topic: merged.topic ?? null, subtopic: merged.subtopic ?? null, contentType: merged.contentType ?? null,
      } as any })
      .eq("id", data.uploadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUploadJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ uploadId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("content_uploads").select("bucket, file_path").eq("id", data.uploadId).maybeSingle();
    if (job?.bucket && job.file_path) await supabaseAdmin.storage.from(job.bucket).remove([job.file_path]);
    await supabaseAdmin.from("content_uploads").delete().eq("id", data.uploadId);
    return { ok: true };
  });

// ── Content management ──
export const adminListContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().max(200).nullable().optional(),
        grade: z.number().int().min(8).max(12).nullable().optional(),
        subject: z.string().max(120).nullable().optional(),
        contentType: z.string().max(40).nullable().optional(),
        status: z.string().max(30).nullable().optional(),
        limit: z.number().int().min(1).max(300).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("learning_content")
      .select("id, title, content_type, status, grade, subject, section, topic, subtopic, year, term, file_path, bucket, file_size, version, archived, created_at, published_at, needs_confirmation, confidence")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.grade) q = q.eq("grade", data.grade);
    if (data.subject) q = q.eq("subject", data.subject);
    if (data.contentType) q = q.eq("content_type", data.contentType);
    if (data.status) q = q.eq("status", data.status);
    if (data.q) q = q.or(`title.ilike.%${data.q}%,topic.ilike.%${data.q}%,subtopic.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminUpdateContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contentId: uuid,
        patch: z
          .object({
            title: z.string().max(200).optional(),
            description: z.string().max(4000).nullable().optional(),
            grade: z.number().int().min(8).max(12).nullable().optional(),
            subject: z.string().max(120).nullable().optional(),
            section: z.string().max(120).nullable().optional(),
            topic: z.string().max(160).nullable().optional(),
            subtopic: z.string().max(160).nullable().optional(),
            content_type: z.string().max(40).optional(),
            status: z.enum(["published", "draft", "unpublished"]).optional(),
            archived: z.boolean().optional(),
          })
          .partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureCurriculumPath } = await import("./videos.server");
    const { snapshotVersion } = await import("./ingest.server");
    await snapshotVersion({ contentId: data.contentId, changedBy: context.userId, note: "Metadata edited" });

    const patch = { ...data.patch } as Record<string, unknown>;
    if (data.patch.grade && data.patch.subject) {
      patch.curriculum_node_id = await ensureCurriculumPath({
        grade: data.patch.grade,
        subject: data.patch.subject,
        section: data.patch.section ?? null,
        topic: data.patch.topic ?? null,
        subtopic: data.patch.subtopic ?? null,
      });
    }
    const { error } = await supabaseAdmin.from("learning_content").update(patch as never).eq("id", data.contentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("learning_content").select("bucket, file_path").eq("id", data.contentId).maybeSingle();
    if (row?.file_path) await supabaseAdmin.storage.from(row.bucket ?? "content-library").remove([row.file_path]);
    const { error } = await supabaseAdmin.from("learning_content").delete().eq("id", data.contentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listContentVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("content_versions")
      .select("id, version, file_path, bucket, note, created_at, changed_by")
      .eq("content_id", data.contentId)
      .order("version", { ascending: false });
    return rows ?? [];
  });

export const restoreContentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ versionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { snapshotVersion } = await import("./ingest.server");
    const { data: ver } = await supabaseAdmin.from("content_versions").select("*").eq("id", data.versionId).maybeSingle();
    if (!ver || !ver.content_id) throw new Error("That version no longer exists.");
    await snapshotVersion({ contentId: ver.content_id, changedBy: context.userId, note: `Superseded by restore of v${ver.version}` });
    const snap = (ver.snapshot ?? {}) as any;
    const { data: current } = await supabaseAdmin.from("learning_content").select("version").eq("id", ver.content_id).maybeSingle();
    const { error } = await supabaseAdmin
      .from("learning_content")
      .update({
        title: snap.title,
        description: snap.description,
        grade: snap.grade,
        subject: snap.subject,
        section: snap.section,
        topic: snap.topic,
        subtopic: snap.subtopic,
        content_type: snap.content_type,
        file_path: ver.file_path,
        bucket: ver.bucket,
        sha256: ver.sha256,
        status: snap.status ?? "published",
        version: (current?.version ?? 1) + 1,
      })
      .eq("id", ver.content_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived signed URL for previewing/downloading a stored file (admin only). */
export const signContentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bucket: z.string().min(1), path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(data.bucket).createSignedUrl(data.path, 600);
    if (error) throw new Error(`Could not create a secure link: ${error.message}`);
    return { url: signed.signedUrl };
  });
