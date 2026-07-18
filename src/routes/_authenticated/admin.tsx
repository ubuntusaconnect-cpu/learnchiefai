import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, primaryRole } from "@/lib/roles";
import { enhanceLesson, listAllLessonIds } from "@/lib/lessons.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Users, Megaphone, BookOpen, Trash2, Sparkles, FileText, Upload, Pencil, X } from "lucide-react";
import { CAPS_SUBJECTS, GRADES, TERMS, yearRange } from "@/lib/papers";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  if (primaryRole(roles) !== "admin") {
    return (
      <AppShell>
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Admins only</h1>
        </Card>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold">Admin Console</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" /> Users</TabsTrigger>
          <TabsTrigger value="subjects"><BookOpen className="mr-2 h-4 w-4" /> Subjects</TabsTrigger>
          <TabsTrigger value="content"><Sparkles className="mr-2 h-4 w-4" /> Content</TabsTrigger>
          <TabsTrigger value="announcements"><Megaphone className="mr-2 h-4 w-4" /> Announcements</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="subjects" className="mt-4"><SubjectsPanel /></TabsContent>
        <TabsContent value="content" className="mt-4"><ContentPanel /></TabsContent>
        <TabsContent value="announcements" className="mt-4"><AnnouncementsPanel /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ContentPanel() {
  const listFn = useServerFn(listAllLessonIds);
  const enhanceFn = useServerFn(enhanceLesson);
  const [status, setStatus] = useState<{ done: number; total: number; current?: string; errors: string[] } | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const lessons = await listFn({ data: undefined as any });
      const errors: string[] = [];
      setStatus({ done: 0, total: lessons.length, errors: [] });
      for (let i = 0; i < lessons.length; i++) {
        const l = lessons[i];
        setStatus({ done: i, total: lessons.length, current: l.title, errors: [...errors] });
        try {
          await enhanceFn({ data: { lessonId: l.id } });
        } catch (e: any) {
          errors.push(`${l.title}: ${e?.message ?? "failed"}`);
        }
      }
      setStatus({ done: lessons.length, total: lessons.length, errors });
      toast.success(`Enhanced ${lessons.length - errors.length} of ${lessons.length} lessons`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start");
    } finally {
      setRunning(false);
    }
  }

  const pct = status ? Math.round((status.done / Math.max(1, status.total)) * 100) : 0;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Sparkles className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-semibold">Enhance every lesson with AI</h2>
          <p className="text-sm text-muted-foreground">Rewrites every lesson into the full textbook structure (objectives, worked examples, callouts, quiz, homework). Runs sequentially to stay under rate limits.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={run} disabled={running}>{running ? "Enhancing…" : "Enhance all lessons"}</Button>
      </div>
      {status && (
        <div className="mt-6 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-sm text-muted-foreground">{status.done} / {status.total}{status.current ? ` — ${status.current}` : ""}</div>
          {status.errors.length > 0 && (
            <details className="mt-2 rounded-lg border bg-destructive/5 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-destructive">{status.errors.length} error(s)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{status.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

function UsersPanel() {
  const { data } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
      const { data: allRoles } = await supabase.from("user_roles").select("*");
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (allRoles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr><th className="p-3">Name</th><th className="p-3">School</th><th className="p-3">Roles</th><th className="p-3">Joined</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-3">{u.full_name ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{u.school ?? "—"}</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r}</span>)}</div></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubjectsPanel() {
  const qc = useQueryClient();
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });
  const [f, setF] = useState({ name: "", slug: "", description: "", category: "academic", icon: "BookOpen" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("subjects").insert(f); if (error) throw error; },
    onSuccess: () => { toast.success("Added"); qc.invalidateQueries({ queryKey: ["subjects"] }); setF({ name: "", slug: "", description: "", category: "academic", icon: "BookOpen" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("subjects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="p-4">
        <div className="divide-y">
          {(subjects ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2">
              <div><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground">{s.category}</div></div>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold">New subject</h3>
        <div className="mt-3 space-y-2">
          <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} />
          <Input placeholder="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          <Textarea placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <Input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Button className="w-full" onClick={() => add.mutate()} disabled={!f.name || !f.slug}>Add subject</Button>
        </div>
      </Card>
    </div>
  );
}

function AnnouncementsPanel() {
  const { data: user } = useSession();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [f, setF] = useState({ title: "", body: "" });
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("announcements").insert({ ...f, author_id: user!.id }); if (error) throw error; },
    onSuccess: () => { toast.success("Posted"); qc.invalidateQueries({ queryKey: ["announcements"] }); setF({ title: "", body: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("announcements").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {(data ?? []).map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                <div className="mt-2 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          </Card>
        ))}
        {(!data || data.length === 0) && <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">No announcements yet.</Card>}
      </div>
      <Card className="p-4">
        <h3 className="font-semibold">New announcement</h3>
        <div className="mt-3 space-y-2">
          <Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Label>Body</Label><Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <Button className="w-full" onClick={() => add.mutate()} disabled={!f.title || !f.body}>Post</Button>
        </div>
      </Card>
    </div>
  );
}
