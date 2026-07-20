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
    const { supabase, userId } = context;

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: conv, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title: data.message.slice(0, 60) })
        .select("id").single();
      if (error) throw error;
      conversationId = conv.id;
    }

    // Insert user message
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId!, role: "user", content: data.message,
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
      { role: "system" as const, content: systemContent },
      ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const { aiChat } = await import("./ai-gateway.server");
    const result = await aiChat(messages, {
      operation: "assistant-chat",
      cache: false, // conversations are stateful; skip cache
      userId,
    });

    await supabase.from("ai_messages").insert({
      conversation_id: conversationId!, role: "assistant", content: result.content,
    });
    await supabase.from("ai_conversations")
      .update({ updated_at: new Date().toISOString() }).eq("id", conversationId!);

    return { conversationId, reply: result.content, provider: result.provider };
  });
