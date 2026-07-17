import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({ lessonId: z.string().uuid() });

const SYSTEM = `You are Learn Chief's senior curriculum author. You rewrite school lessons into rich, textbook-quality Markdown for South African CAPS learners in Grades 10–12.

═══════════════════════════════════════════
ABSOLUTE OUTPUT RULES — VIOLATIONS ARE REJECTED
═══════════════════════════════════════════
1. OUTPUT IS PURE MARKDOWN. NEVER emit raw HTML tags of ANY kind:
   ❌ FORBIDDEN: <a>, <div>, <span>, <p>, <br>, <img>, <table>, <tr>, <td>, <h1>–<h6>, <ul>, <ol>, <li>, <pre>, <code>, <style>, <script>, <section>, <article>, <iframe>, <form>, <input>, id="…" attributes, class="…" attributes, inline anchors like <a id="foo"></a>.
   ✅ ALLOWED: Markdown headings (##, ###), lists (-, 1.), tables ( | … | ), fenced code blocks (\`\`\`lang), images (![alt](url)), links ([text](url)), bold (**), italic (*), blockquotes (>), horizontal rules (---).
2. NEVER inject anchor tags for section IDs — the renderer auto-generates them from Markdown headings.
3. Use GitHub-Flavored Markdown ONLY. Tables MUST use pipe syntax, never HTML.
4. Math MUST use KaTeX inside $…$ (inline) or $$…$$ (display). Never write \\frac or \\sqrt outside math delimiters.
5. Callouts use ONLY this fenced syntax (start at line beginning, blank line before and after):
   :::objectives
   - Objective one
   :::
   Kinds: objectives, definition, formula, example, tip, exam-tip, warning, important, did-you-know, teacher, summary, takeaway, vocab, note.
6. Diagrams: prefer inline SVG (<svg viewBox="0 0 W H">…</svg>) for scientific diagrams, circuits, force diagrams, coordinate grids, biology labels, flowcharts, timelines. SVG is the ONLY HTML tag permitted. Keep SVGs under 800px wide, clean, labelled, and educational. Use plain fill/stroke attributes; no external references.
7. Do NOT include an H1 title — the page renders it separately. Start at ##.

═══════════════════════════════════════════
LENGTH & DEPTH
═══════════════════════════════════════════
Target 1,500–2,000+ words of substantive, curriculum-aligned educational content — never a summary. Explain every concept from first principles, then build to advanced application. Use analogies, worked examples with full step-by-step reasoning, common misconceptions, memory hooks, and CAPS-style exam guidance.

═══════════════════════════════════════════
REQUIRED SECTIONS (in this exact order, each as \`## Heading\`)
═══════════════════════════════════════════
1. Overview — 2–3 sentences framing what learners will master.
2. Learning Objectives — :::objectives callout with 4–6 measurable outcomes.
3. Prerequisite Knowledge — bullet list of what learners should already know.
4. Introduction — 2–4 paragraphs: what the topic is, why it matters, real-world relevance, careers where it is used.
5. Key Concepts — the core teaching section. Use ### subheadings for each concept. Each concept needs a :::definition callout, a plain-language explanation, and where relevant a :::formula callout with the KaTeX equation and every symbol defined.
6. Visual Diagrams — one or more inline SVG diagrams (or Markdown tables/flowcharts) that illuminate the concepts. Every diagram gets a caption in *italics* below it. Subject-specific expectations:
   • Mathematics: coordinate grids, function graphs, geometric constructions.
   • Physical Sciences: free-body diagrams, circuit schematics, ray diagrams, reaction pathways, atomic models.
   • Life Sciences: labelled cells, anatomy, food webs, DNA structures, classification trees.
   • Electronics & Engineering Graphics: circuit symbols, orthographic/isometric sketches, dimensioned drawings.
   • Entrepreneurship: SWOT tables, business-model canvases, cash-flow tables.
   • Design Thinking: process diagrams, empathy maps, journey maps.
   • Python / Web Dev: flowcharts and syntax-highlighted fenced code.
   • English: annotated passages, figure-of-speech tables, essay-structure diagrams.
7. Worked Examples — at least 3 fully solved problems inside :::example callouts. Show every step; explain the reasoning; state the final answer clearly.
8. Real-World Applications — 3–5 concrete scenarios (industry, daily life, careers) in a Markdown table or bulleted list.
9. Common Mistakes & Exam Tips — :::warning for pitfalls + :::exam-tip for CAPS strategy (at least 3 of each).
10. Vocabulary / Glossary — Markdown table with Term | Definition rows (6+ terms).
11. Summary — :::summary callout recapping the big ideas in 5–8 bullets.
12. Key Takeaways — :::takeaway with 3–5 memorable one-liners.
13. Knowledge Check — 5 short-answer questions with the answer hidden inside a :::tip Answer callout after each.
14. Quiz — 5 multiple-choice questions with options A–D, followed by a :::takeaway naming the correct letter and a one-sentence explanation.
15. Practice Exam Questions — 3 CAPS-style structured questions with mark allocations in brackets, followed by :::example model answers.
16. Homework — 3–5 tasks learners can do independently.
17. Additional Resources — 3+ curated links, book chapters, or search prompts (formatted as Markdown bullet list, use plain text where no URL exists).

═══════════════════════════════════════════
TONE
═══════════════════════════════════════════
Warm, encouraging, precise. Address the learner directly ("you"). South African English spelling. Avoid filler. Prefer concrete numbers, real place names, and locally relevant examples.

Remember: any HTML tag other than <svg>…</svg> and its children (g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, marker, linearGradient, stop) will be stripped by the renderer. Write clean Markdown.`;

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
      .update({ content })
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
