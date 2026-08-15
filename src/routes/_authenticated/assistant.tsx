import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { MarkdownView } from "@/components/app/MarkdownView";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/lib/roles";
import { sendAiMessage } from "@/lib/ai-chat.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, Send, Plus, Loader2, MessagesSquare, Sparkles, Trash2, Paperclip, Camera, X, FileText, ImageIcon, AlertCircle } from "lucide-react";
import {
  ACCEPTED_ATTACHMENTS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  attachmentKind,
  extractAttachmentText,
  formatBytes,
  uploadAttachment,
  validateAttachment,
  type PendingAttachment,
} from "@/lib/chat-attachments";
import { AttachmentChips } from "@/components/app/ChatAttachments";

const search = z.object({
  c: z.string().uuid().optional(),
  topic: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/assistant")({
  validateSearch: search,
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Explain photosynthesis for Grade 10",
  "Solve 3x² - 12x + 9 = 0 step by step",
  "Write a Python function that reverses a string",
  "Summarise the causes of World War I",
  "Generate 5 revision questions on Newton's laws",
];

function AssistantPage() {
  const { c: conversationParam, topic } = Route.useSearch();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const qc = useQueryClient();
  const send = useServerFn(sendAiMessage);

  const [conversationId, setConversationId] = useState<string | null>(conversationParam ?? null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setConversationId(conversationParam ?? null); }, [conversationParam]);

  const { data: conversations } = useQuery({
    queryKey: ["ai-convos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["ai-msgs", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data } = await supabase.from("ai_messages").select("*").eq("conversation_id", conversationId!).order("created_at");
      return data ?? [];
    },
  });

  const { data: msgAttachments } = useQuery({
    queryKey: ["ai-msg-atts", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_message_attachments")
        .select("id, message_id, file_name, mime_type, size_bytes, kind, storage_path")
        .eq("conversation_id", conversationId!)
        .order("created_at");
      return data ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function update(id: string, patch: Partial<PendingAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function addFiles(files: File[]) {
    if (!user) return;
    const room = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return;
    }
    const accepted: PendingAttachment[] = [];
    for (const file of files.slice(0, room)) {
      const problem = validateAttachment(file);
      if (problem) { toast.error(problem); continue; }
      const kind = attachmentKind(file);
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        status: "preparing",
        progress: 0,
        previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
      });
    }
    if (files.length > room) toast.error(`Only ${room} more file(s) could be added to this message.`);
    if (accepted.length === 0) return;
    setAttachments((prev) => [...prev, ...accepted]);

    for (const item of accepted) {
      try {
        update(item.id, { status: "processing" });
        const { text, note } = item.kind === "image"
          ? { text: null, note: undefined }
          : await extractAttachmentText(item.file);
        update(item.id, { extractedText: text, note, status: "uploading" });
        const path = await uploadAttachment(user.id, item.file, (pct) => update(item.id, { progress: pct }));
        update(item.id, { storagePath: path, status: "ready", progress: 100 });
      } catch (e: any) {
        update(item.id, { status: "failed", error: e?.message ?? "Upload failed." });
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  const busyUploading = attachments.some((a) => a.status === "preparing" || a.status === "processing" || a.status === "uploading");
  const readyAttachments = attachments.filter((a) => a.status === "ready" && a.storagePath);
  const canSend = !sending && !busyUploading && (input.trim().length > 0 || readyAttachments.length > 0);

  async function submit(text?: string) {
    const message = (text ?? input).trim();
    const payloadAttachments = text ? [] : readyAttachments;
    if ((!message && payloadAttachments.length === 0) || sending || busyUploading) return;
    setInput("");
    setSending(true);
    try {
      const res = await send({
        data: {
          conversationId,
          message,
          topic,
          attachments: payloadAttachments.map((a) => ({
            storagePath: a.storagePath!,
            fileName: a.file.name,
            mimeType: a.file.type || "application/octet-stream",
            sizeBytes: a.file.size,
            kind: a.kind,
            extractedText: a.extractedText ?? null,
          })),
        },
      });
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      if (!text) setAttachments([]);
      qc.invalidateQueries({ queryKey: ["ai-msg-atts", res.conversationId] });
      if (!conversationId) {
        setConversationId(res.conversationId!);
        navigate({ to: "/assistant", search: { c: res.conversationId!, topic } });
      }
      qc.invalidateQueries({ queryKey: ["ai-msgs", res.conversationId] });
      qc.invalidateQueries({ queryKey: ["ai-convos"] });
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    setConversationId(null);
    navigate({ to: "/assistant", search: {} });
  }

  async function deleteConvo(id: string) {
    await supabase.from("ai_conversations").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["ai-convos"] });
    if (id === conversationId) newChat();
  }

  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]" style={{ minHeight: "calc(100vh - 8rem)" }}>
        {/* History */}
        <Card className="hidden p-3 lg:block">
          <Button onClick={newChat} className="w-full bg-gradient-primary"><Plus className="mr-2 h-4 w-4" /> New chat</Button>
          <div className="mt-4 space-y-1 overflow-auto">
            <div className="px-2 pb-2 text-xs uppercase text-muted-foreground">History</div>
            {(conversations ?? []).map((c) => (
              <div key={c.id} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${c.id === conversationId ? "bg-primary/10 text-primary" : "hover:bg-accent/40"}`}>
                <button onClick={() => { setConversationId(c.id); navigate({ to: "/assistant", search: { c: c.id } }); }} className="flex-1 truncate text-left">
                  <MessagesSquare className="mr-1 inline h-3 w-3" /> {c.title}
                </button>
                <button onClick={() => deleteConvo(c.id)} className="opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
            {(!conversations || conversations.length === 0) && (
              <p className="px-2 text-xs text-muted-foreground">No chats yet.</p>
            )}
          </div>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold">AI Study Assistant</div>
              <div className="text-xs text-muted-foreground">Focused on your learning{topic ? ` · ${topic}` : ""}</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-4">
            {!messages || messages.length === 0 ? (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-3 text-2xl font-bold">How can I help you learn today?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Ask about any subject, request explanations, get coding help, or generate quizzes.</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => submit(s)} className="rounded-xl border bg-card p-3 text-left text-sm hover:border-primary hover:shadow-card">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((m: any) => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role !== "user" && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground"><Bot className="h-4 w-4" /></div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-gradient-primary text-primary-foreground" : "bg-muted"}`}>
                      <AttachmentChips items={(msgAttachments ?? []).filter((a: any) => a.message_id === m.id)} />
                      <MarkdownView className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-2 prose-p:my-1">
                        {m.content}
                      </MarkdownView>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground"><Bot className="h-4 w-4" /></div>
                    <div className="rounded-2xl bg-muted px-4 py-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
            className={`border-t p-3 ${dragging ? "bg-primary/5" : ""}`}
          >
            <div className="mx-auto max-w-3xl space-y-2">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="relative flex w-52 items-center gap-2 rounded-xl border bg-card p-2">
                      {a.previewUrl ? (
                        <img src={a.previewUrl} alt={a.file.name} className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{a.file.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {a.status === "failed" ? (
                            <span className="text-destructive">{a.error}</span>
                          ) : a.status === "ready" ? (
                            formatBytes(a.file.size)
                          ) : a.status === "uploading" ? (
                            `Uploading ${a.progress}%`
                          ) : a.status === "processing" ? "Reading file…" : "Preparing…"}
                        </div>
                        {(a.status === "uploading" || a.status === "processing") && (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${a.status === "uploading" ? a.progress : 15}%` }} />
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => removeAttachment(a.id)} aria-label={`Remove ${a.file.name}`} className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 shadow-sm">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachments.some((a) => a.note) && (
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{attachments.filter((a) => a.note).map((a) => a.note).join(" ")}</span>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_ATTACHMENTS}
                  className="hidden"
                  onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
                />
                <Button type="button" variant="outline" size="icon" aria-label="Attach a photo or document" title="Attach a photo or document" disabled={sending} onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Take a photo" title="Take a photo" className="sm:hidden" disabled={sending} onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                </Button>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files);
                    if (files.length) { e.preventDefault(); addFiles(files); }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder="Ask anything — or attach a photo of your homework…"
                  className="min-h-[52px] resize-none"
                  disabled={sending}
                />
                <Button type="submit" disabled={!canSend} className="bg-gradient-primary">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <ImageIcon className="mr-1 inline h-3 w-3" />
                Photos, PDFs and documents up to 25 MB — the AI reads them and answers from what it sees.
              </p>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
