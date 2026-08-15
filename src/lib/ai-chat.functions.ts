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

const ATTACHMENT_PROMPT = `The learner has attached one or more files (photos, diagrams, worksheets or documents). You can actually see and read them.

When attachments are present:
- Inspect the attachment carefully before answering, and refer to what is actually visible or readable in it (question numbers, labels, values, axes, components, text).
- Answer the learner's question using the attachment as the primary source of truth.
- Teach: explain the reasoning and show working step by step rather than only stating the final answer. Point out mistakes in the learner's own work and give hints where useful.
- For calculations, verify your arithmetic before answering.
- For diagrams and circuits, describe what the diagram actually shows before interpreting it.
- For handwritten work, clearly separate what you can read confidently from what is uncertain.
- If the image is blurry, dark, cropped, rotated, low resolution, or the relevant question is missing, say so honestly and ask for a clearer photo or for the value to be typed. NEVER guess or invent text, numbers or content you cannot read.
- Never fabricate information and claim it came from the attachment. If something is not in the attachment, say so.`;

const AttachmentInput = z.object({
  storagePath: z.string().min(1).max(400),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().max(50 * 1024 * 1024),
  kind: z.enum(["image", "document"]),
  extractedText: z.string().max(120000).nullable().optional(),
});

const InputSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  message: z.string().max(4000),
  topic: z.string().optional(),
  attachments: z.array(AttachmentInput).max(5).optional(),
});

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const sendAiMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const incoming = data.attachments ?? [];
    const text = data.message.trim();

    if (!text && incoming.length === 0) {
      throw new Error("Type a question or attach a file first.");
    }

    // Every attachment must live inside the caller's own storage folder.
    for (const a of incoming) {
      if (!a.storagePath.startsWith(`${userId}/`)) {
        throw new Error("You can only send your own attachments.");
      }
    }
    const totalBytes = incoming.reduce((n, a) => n + a.sizeBytes, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("These attachments are too large to analyse together. Please send fewer or smaller files.");
    }

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const title = (text || incoming[0]?.fileName || "New chat").slice(0, 60);
      const { data: conv, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title })
        .select("id").single();
      if (error) throw error;
      conversationId = conv.id;
    }

    // Insert user message
    const { data: userMsg, error: userMsgError } = await supabase.from("ai_messages").insert({
      conversation_id: conversationId!,
      role: "user",
      content: text || `(attached ${incoming.length} file${incoming.length === 1 ? "" : "s"})`,
    }).select("id").single();
    if (userMsgError) throw userMsgError;

    // Persist attachment records against that specific message
    if (incoming.length > 0) {
      const { error: attErr } = await supabase.from("ai_message_attachments").insert(
        incoming.map((a) => ({
          message_id: userMsg.id,
          conversation_id: conversationId!,
          user_id: userId,
          file_name: a.fileName,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          kind: a.kind,
          storage_path: a.storagePath,
          extracted_text: a.extractedText ?? null,
        })),
      );
      if (attErr) throw new Error("Your files were uploaded but could not be attached to the message. Please try again.");
    }

    // Load history
    const { data: history } = await supabase
      .from("ai_messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true })
      .limit(30);

    const historyRows = history ?? [];

    // Attachments for this conversation, so earlier files stay in context.
    const { data: attRows } = await supabase
      .from("ai_message_attachments")
      .select("message_id, file_name, mime_type, kind, storage_path, extracted_text, created_at")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true });

    const byMessage = new Map<string, typeof attRows>();
    for (const row of attRows ?? []) {
      if (!row.message_id) continue;
      const list = byMessage.get(row.message_id) ?? [];
      list.push(row);
      byMessage.set(row.message_id, list as any);
    }

    // Only the two most recent attachment-carrying messages get their real bytes
    // re-sent; older ones fall back to a short text reference.
    const attachmentMessageIds = historyRows.filter((m) => byMessage.has(m.id)).map((m) => m.id);
    const bytesAllowed = new Set(attachmentMessageIds.slice(-2));

    type Att = {
      kind: "image" | "document";
      name: string;
      mimeType: string;
      base64?: string;
      text?: string | null;
    };

    let budget = MAX_TOTAL_BYTES;
    async function loadBytes(path: string, mimeType: string): Promise<string | undefined> {
      const { data: blob, error } = await supabase.storage.from("chat-attachments").download(path);
      if (error || !blob) return undefined;
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (buf.byteLength > budget) return undefined;
      budget -= buf.byteLength;
      // PDFs and images only; anything else is handled as extracted text.
      if (!(mimeType.startsWith("image/") || mimeType === "application/pdf")) return undefined;
      return Buffer.from(buf).toString("base64");
    }

    const systemContent = [
      SYSTEM_PROMPT,
      data.topic ? `\n\nCurrent topic context: ${data.topic}` : "",
      (attRows?.length ?? 0) > 0 ? `\n\n${ATTACHMENT_PROMPT}` : "",
    ].join("");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string; attachments?: Att[] }> = [
      { role: "system", content: systemContent },
    ];

    for (const m of historyRows) {
      const rows = byMessage.get(m.id) ?? [];
      const role = m.role as "user" | "assistant";
      if (rows.length === 0 || role !== "user") {
        messages.push({ role, content: m.content });
        continue;
      }
      const attachments: Att[] = [];
      let noteOnly = "";
      for (const r of rows) {
        const isVisual = r.kind === "image" || r.mime_type === "application/pdf";
        if (bytesAllowed.has(m.id) && isVisual) {
          const base64 = await loadBytes(r.storage_path, r.mime_type);
          if (base64) {
            attachments.push({
              kind: r.kind === "image" ? "image" : "document",
              name: r.file_name,
              mimeType: r.mime_type,
              base64,
              text: r.extracted_text,
            });
            continue;
          }
        }
        if (r.extracted_text) {
          attachments.push({
            kind: "document",
            name: r.file_name,
            mimeType: r.mime_type,
            text: r.extracted_text,
          });
        } else {
          noteOnly += `\n[earlier attachment: ${r.file_name}]`;
        }
      }
      messages.push({
        role,
        content: m.content + noteOnly,
        ...(attachments.length ? { attachments } : {}),
      });
    }

    const { aiChat } = await import("./ai-gateway.server");
    const result = await aiChat(messages, {
      operation: incoming.length > 0 ? "assistant-chat-multimodal" : "assistant-chat",
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
