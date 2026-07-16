import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({ lessonId: z.string().uuid() });

const SYSTEM = `You are Learn Chief's senior curriculum author. You rewrite school lessons into rich, textbook-quality Markdown for South African CAPS learners.

STRICT OUTPUT RULES
- Output ONLY Markdown. No preamble, no code fences around the whole answer.
- Use these headings, in this order, each as \`## Heading\`:
  1. Learning Objectives
  2. Introduction
  3. Key Concepts
  4. Worked Examples
  5. Visual Diagrams
  6. Real-Life Applications
  7. Important Notes
  8. Summary
  9. Key Takeaways
  10. Practice Questions
  11. Quiz
  12. Homework
  13. Additional Resources
- Use rich callout blocks with this exact syntax (must start at line beginning):
  :::objectives
  - Objective 1
  :::
  Available kinds: objectives, definition, formula, example, tip, exam-tip, warning, important, did-you-know, teacher, summary, takeaway, vocab, note.
- Math MUST use LaTeX inside $...$ or $$...$$. Never write raw \\frac or \\sqrt outside math delimiters.
- Use Markdown tables for comparisons, data, periodic properties, etc.
- Use fenced code blocks with language tag for any code (python, javascript, html, css, sql).
- For "Visual Diagrams", either (a) describe with an ASCII/box diagram in a fenced \`text\` block, (b) describe a Mermaid-style flow in plain text, or (c) if the lesson already contains an image (![...](...)) reference, keep it. Do not invent image URLs.
- Practice Questions: 5 numbered questions with answers hidden inside a :::tip Answer callout after each.
- Quiz: 3 multiple-choice questions with 4 options each (A–D) and mark the correct answer in a :::takeaway block.
- Write for the specified grade level. Use clear, encouraging tone. Include worked examples with step-by-step working. Include common mistakes and memory tips where useful.
- Length: aim for 900–1600 words of substantive educational content.
- Do NOT include the lesson title as an H1 — the page renders it separately.`;

export const enhanceLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");
    const { supabase, userId } = context;

    // Admin/teacher only.
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "teacher");
    if (!allowed) throw new Error("Only teachers or admins can enhance lessons.");

    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("id, title, content, modules(title, courses(title, subjects(name)))")
      .eq("id", data.lessonId)
      .maybeSingle();
    if (error) throw error;
    if (!lesson) throw new Error("Lesson not found.");

    const subject = (lesson as any).modules?.courses?.subjects?.name ?? "General";
    const course = (lesson as any).modules?.courses?.title ?? "";
    const module = (lesson as any).modules?.title ?? "";

    const userPrompt = `Rewrite this lesson into the full structured format.

Subject: ${subject}
Course: ${course}
Module: ${module}
Lesson title: ${lesson.title}

Existing content (use as source material, expand and improve — keep any image references):
"""
${(lesson.content ?? "").slice(0, 6000)}
"""`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI is busy — try again in a moment.");
      if (res.status === 402) throw new Error("AI usage limit reached. Please add credits.");
      throw new Error(`AI error: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("The AI returned no content.");

    const { error: upErr } = await supabase
      .from("lessons")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", data.lessonId);
    if (upErr) throw upErr;

    return { ok: true, length: content.length };
  });

export const listAllLessonIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "teacher");
    if (!allowed) throw new Error("Only teachers or admins can enhance lessons.");
    const { data, error } = await supabase.from("lessons").select("id, title").order("created_at");
    if (error) throw error;
    return data ?? [];
  });
