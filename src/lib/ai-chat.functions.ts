import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SYSTEM_PROMPT = `You are Learn Chief AI, a focused study assistant for South African learners (CAPS curriculum, Grades 8–12) and technology skills (coding, robotics, engineering, design).

Guidelines:
- Stay in the learning domain. Politely decline off-topic requests.
- Explain concepts clearly and simply, adapted to the learner's grade.
- Show step-by-step working for maths and science.
- Use fenced code blocks with the language tag for any code. Prefer Python for beginners.
- Use LaTeX-style formatting inside \`$...$\` for inline math and \`$$...$$\` for display math.
- When helpful, generate practice questions and revision summaries.
- Be encouraging. Keep answers concise unless depth is needed.`;

const InputSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  message: z.string().min(1).max(4000),
  topic: z.string().optional(),
});

export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");
    const { supabase, userId } = context;

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: conv, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = conv.id;
    }

    // Insert user message
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId!,
      role: "user",
      content: data.message,
    });

    // Load history
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true })
      .limit(30);

    const systemContent = data.topic
      ? `${SYSTEM_PROMPT}\n\nCurrent topic context: ${data.topic}`
      : SYSTEM_PROMPT;

    const messages = [
      { role: "system", content: systemContent },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The AI is a bit busy — please try again shortly.");
      if (res.status === 402) throw new Error("AI usage limit reached. Please add credits.");
      throw new Error(`AI error: ${res.status} ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    await supabase.from("ai_messages").insert({
      conversation_id: conversationId!,
      role: "assistant",
      content: reply,
    });

    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId!);

    return { conversationId, reply };
  });
