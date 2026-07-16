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
import { Bot, Send, Plus, Loader2, MessagesSquare, Sparkles, Trash2 } from "lucide-react";

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function submit(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    try {
      const res = await send({ data: { conversationId, message, topic } });
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
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:my-2 prose-p:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
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

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="border-t p-3">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Ask anything about your studies…"
                className="min-h-[52px] resize-none"
                disabled={sending}
              />
              <Button type="submit" disabled={sending || !input.trim()} className="bg-gradient-primary">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
