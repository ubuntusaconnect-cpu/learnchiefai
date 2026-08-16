import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({ lessonId: z.string().uuid() });

// ── 17 required sections, in exact order ──────────────────────────────────
const REQUIRED_SECTIONS = [
  "Lesson Overview",
  "Learning Objectives",
  "Prerequisite Knowledge",
  "Introduction",
  "Key Concepts",
  "Detailed Explanations",
  "Definitions",
  "Worked Examples",
  "Real-World Applications",
  "Visual Learning",
  "Activities",
  "Practice Questions",
  "Exam-Style Questions",
  "Common Mistakes",
  "Revision Summary",
  "Glossary",
  "Key Takeaways",
] as const;

function subjectAddendum(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("math"))
    return `SUBJECT-SPECIFIC (Mathematics): every lesson MUST include :::formula callouts, step-by-step worked solutions, multiple examples, practice exercises, at least one challenge question, and inline SVG for coordinate grids / geometry / function graphs / trig diagrams where relevant. Include at least one Markdown table (e.g. value table) and full answer explanations.`;
  if (s.includes("physical") || s.includes("physics") || s.includes("chem"))
    return `SUBJECT-SPECIFIC (Physical Sciences): include free-body/force diagrams (SVG), motion diagrams, circuit schematics (SVG), balanced chemical equations, an atomic model diagram, an energy transfer diagram, a lab experiment layout, a scientific data table, fully worked calculations with units, and a formula sheet (:::formula) block.`;
  if (s.includes("life") || s.includes("bio"))
    return `SUBJECT-SPECIFIC (Life Sciences): include labelled SVG diagrams appropriate to the topic — cells, human/plant anatomy, food webs, food chains, DNA, genetics (Punnett squares as tables), ecology diagrams, classification trees, biological process flowcharts.`;
  if (s.includes("electronic") || s.includes("engineering") || s.includes("robot"))
    return `SUBJECT-SPECIFIC (Electronics & Engineering Graphics): include SVG orthographic and isometric sketches, circuit schematics with standard symbols, dimensioned drawings, mechanical illustrations.`;
  if (s.includes("entrepren") || s.includes("business"))
    return `SUBJECT-SPECIFIC (Entrepreneurship): include a business case study, a SWOT analysis (Markdown table), a business model canvas (table), a cash-flow example (table), an income statement (table), a balance sheet example (table), a marketing funnel (SVG), a customer journey diagram (SVG), and branding examples.`;
  return `SUBJECT-SPECIFIC: include at least two inline SVG diagrams or Markdown tables that visualise the core ideas of this topic.`;
}

function buildSystemPrompt(subject: string): string {
  return `You are Learn Chief's senior curriculum author. You write full, publication-quality digital textbook chapters for South African CAPS learners (Grades 10–12). Your output must feel like a professionally published textbook — never like AI notes.

═══════════════════════════════════════════
ABSOLUTE OUTPUT RULES — VIOLATIONS ARE REJECTED
═══════════════════════════════════════════
1. OUTPUT IS PURE MARKDOWN. The ONLY HTML tag permitted is inline <svg>…</svg> (with children: g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, marker, linearGradient, stop, title). Every other HTML tag (<a>, <div>, <span>, <p>, <br>, <img>, <table>, <tr>, <td>, <h1>–<h6>, <ul>, <ol>, <li>, <pre>, <code>, <style>, <script>, <section>, <article>, <iframe>, <form>, <input>, id="…", class="…") is FORBIDDEN and will be stripped.
2. NEVER inject anchor tags for section IDs — the renderer auto-generates them from Markdown headings.
3. Tables MUST use GitHub-flavoured pipe syntax, never HTML.
4. Math MUST use KaTeX inside $…$ (inline) or $$…$$ (display).
5. Callouts use ONLY this fenced syntax (blank line before and after):
   :::objectives
   - Objective one
   :::
   Kinds: objectives, definition, formula, example, tip, exam-tip, warning, important, did-you-know, teacher, summary, takeaway, vocab, note.
6. Diagrams: use inline SVG (viewBox, plain fill/stroke, labelled with <text>). Keep under 800px wide. Every diagram MUST have an italic caption on the next line. NEVER reference external image URLs.
7. Do NOT include an H1 title — the page renders it separately. Start at ##.
8. Absolutely no placeholders, no "TODO", no "[insert …]", no "coming soon", no ellipses that stand in for missing content.
9. No generic AI filler ("In today's fast-paced world…", "It is important to note that…"). Write like a textbook author.

═══════════════════════════════════════════
LENGTH & DEPTH — HARD MINIMUM
═══════════════════════════════════════════
The chapter MUST be **at least 1,800 words** of substantive teaching (aim for 2,000+; go higher when the topic demands). Cover the full CAPS syllabus scope for the topic. Build progressively: beginner → intermediate → advanced. Explain every concept from first principles with analogies, then apply it, then examine it under exam conditions. No summaries substituting for teaching.

═══════════════════════════════════════════
REQUIRED SECTIONS — EXACT ORDER, EXACT HEADINGS
═══════════════════════════════════════════
Each section is a top-level "## " Markdown heading. Use these exact heading texts, in this order (any missing section is a rejection):

## Lesson Overview
## Learning Objectives
## Prerequisite Knowledge
## Introduction
## Key Concepts
## Detailed Explanations
## Definitions
## Worked Examples
## Real-World Applications
## Visual Learning
## Activities
## Practice Questions
## Exam-Style Questions
## Common Mistakes
## Revision Summary
## Glossary
## Key Takeaways

Section content requirements:
- Lesson Overview: 2–3 sentences framing what learners will master, plus estimated study time.
- Learning Objectives: :::objectives callout with 5–7 measurable outcomes ("Learners will be able to…").
- Prerequisite Knowledge: bullet list of prior concepts, with a one-line refresher for each.
- Introduction: 3–5 rich paragraphs — the story of the topic, why it matters, careers where it is used, a hook.
- Key Concepts: ### subheadings for each core concept, each with a :::definition callout and plain-language explanation.
- Detailed Explanations: deeper treatment of each concept with :::formula callouts (KaTeX, every symbol defined), derivations, and analogies. This is the longest section.
- Definitions: Markdown table (Term | Definition) of 8+ key terms.
- Worked Examples: at least 4 fully solved problems inside :::example callouts. Show every step and state the final answer.
- Real-World Applications: 4–6 concrete scenarios (industry, daily life, careers) as a Markdown table.
- Visual Learning: two or more inline SVG diagrams (or Mermaid-compatible flowcharts written as SVG) — each with an italic caption. Subject-appropriate (see subject rules below).
- Activities: 3–5 hands-on tasks learners can do at home or in class.
- Practice Questions: 6 short-answer questions, each followed by a :::tip Answer callout with the worked answer.
- Exam-Style Questions: 3 CAPS-style structured questions with mark allocations in brackets, followed by :::example model answers.
- Common Mistakes: :::warning callouts covering at least 4 pitfalls with the correction.
- Revision Summary: :::summary callout of 6–10 bullets covering the whole chapter.
- Glossary: Markdown table of 10+ terms with precise definitions (may overlap with Definitions but must be more comprehensive).
- Key Takeaways: :::takeaway callout with 4–6 memorable one-liners plus a short revision checklist (bulleted).

═══════════════════════════════════════════
${subjectAddendum(subject)}
═══════════════════════════════════════════

Interactive elements to weave through the chapter: :::tip quick knowledge checks, :::did-you-know facts, :::exam-tip strategy notes, memory aids/mnemonics.

═══════════════════════════════════════════
TONE
═══════════════════════════════════════════
Warm, encouraging, precise, age-appropriate. Address the learner directly ("you"). South African English spelling. Prefer concrete numbers, real place names, and locally relevant examples (rand, load-shedding, Table Mountain, taxis, matric, etc.). No repetition. No filler.

Return ONLY the Markdown chapter. No preamble, no closing remarks, no code fences around the whole output.`;
}

// ── Post-processing: strip disallowed HTML the model may leak ─────────────
function sanitizeOutput(md: string): string {
  return md
    .replace(/<\s*a\b[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, "$1")
    .replace(/<\s*a\b[^>]*\/?\s*>/gi, "")
    .replace(/<\s*\/?\s*(span|p|section|article|header|footer|nav|aside|form|input|button|label|iframe|style|script)\b[^>]*>/gi, "")
    .replace(/^(#{1,6}\s.+?)\s*\{#[\w-]+\}\s*$/gm, "$1")
    .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1") // unwrap whole-doc code fence
    .trim();
}

function countWords(md: string): number {
  // Strip code fences, SVG blocks, tables' pipe chars, callout markers.
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/[:|>#*_`\-]/g, " ");
  return stripped.trim().split(/\s+/).filter(Boolean).length;
}

function missingSections(md: string): string[] {
  const headings = new Set(
    md.split("\n")
      .map((l) => /^##\s+(.+?)\s*$/.exec(l)?.[1]?.trim().toLowerCase())
      .filter(Boolean) as string[],
  );
  return REQUIRED_SECTIONS.filter((s) => !headings.has(s.toLowerCase()));
}

async function callAI(system: string, user: string, userId: string): Promise<string> {
  const { aiChat } = await import("./ai-gateway.server");
  const result = await aiChat(
    [ { role: "system", content: system }, { role: "user", content: user } ],
    { operation: "lesson-enhance", cache: true, userId, maxTokens: 8192 },
  );
  const content = result.content.trim();
  if (!content) throw new Error("The AI returned no content.");
  return content;
}

export const enhanceLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const { supabase, userId } = context;
    const { assertStaff } = await import("./authz.server");
    const { enforceRateLimit, RATE_LIMITS, SafeError } = await import("./security.server");
    await assertStaff(supabase, userId, "enhanceLesson");
    await enforceRateLimit(RATE_LIMITS.lessonEnhance, userId);
    if (!apiKey) throw new SafeError("AI is not configured.");


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
    const system = buildSystemPrompt(subject);

    const baseUserPrompt = `Write the complete textbook chapter for this lesson.

Subject: ${subject}
Course: ${course}
Module: ${module}
Lesson title: ${lesson.title}

Source material (expand and improve; preserve any Markdown image references):
"""
${(lesson.content ?? "").slice(0, 8000)}
"""

Remember: 1,800+ words minimum, all 17 required sections with the exact headings, subject-specific diagrams as inline SVG, pure Markdown only.`;

    // Generate + validate + regenerate loop (max 3 attempts).
    const MIN_WORDS = 1800;
    let content = "";
    let attempt = 0;
    let lastIssues: string[] = [];

    while (attempt < 3) {
      attempt++;
      const userPrompt =
        attempt === 1
          ? baseUserPrompt
          : `${baseUserPrompt}

Your previous draft was REJECTED for these reasons:
${lastIssues.map((i) => `- ${i}`).join("\n")}

Regenerate the FULL chapter fixing every issue. Do not shorten. Do not omit any of the 17 required section headings.`;

      const raw = await callAI(apiKey, system, userPrompt);
      content = sanitizeOutput(raw);

      const issues: string[] = [];
      const missing = missingSections(content);
      if (missing.length) issues.push(`Missing required section headings: ${missing.join(", ")}`);
      const words = countWords(content);
      if (words < MIN_WORDS) issues.push(`Chapter is only ${words} words; minimum is ${MIN_WORDS}.`);
      if (/\bTODO\b|\[insert |coming soon|placeholder/i.test(content))
        issues.push("Placeholder text detected — remove and write full content.");
      if (/<\s*(div|span|p|iframe|script|style)\b/i.test(content))
        issues.push("Disallowed HTML tags detected — use pure Markdown.");

      if (issues.length === 0) break;
      lastIssues = issues;
    }

    const { error: upErr } = await supabase
      .from("lessons")
      .update({ content })
      .eq("id", data.lessonId);
    if (upErr) throw upErr;

    return { ok: true, length: content.length, words: countWords(content), attempts: attempt };
  });

export const listAllLessonIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { assertStaff } = await import("./authz.server");
    await assertStaff(supabase, userId, "listAllLessonIds");
    const { data, error } = await supabase.from("lessons").select("id, title").order("created_at");
    if (error) throw error;
    return data ?? [];
  });
