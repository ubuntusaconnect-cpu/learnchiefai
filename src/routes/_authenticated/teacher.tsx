import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, primaryRole } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, BookOpen, Edit, Trash2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teacher")({
  component: TeacherPage,
});

function TeacherPage() {
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const role = primaryRole(roles);
  const qc = useQueryClient();

  const isEducator = role === "teacher" || role === "admin";

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });

  const { data: courses } = useQuery({
    queryKey: ["teacher-courses", user?.id],
    enabled: !!user && isEducator,
    queryFn: async () => {
      const q = supabase.from("courses").select("*, subjects(name)").order("created_at", { ascending: false });
      const { data } = role === "admin" ? await q : await q.eq("teacher_id", user!.id);
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", subject_id: "", level: "beginner", grade: "", is_published: false });

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
  }

  const upsertCourse = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, teacher_id: user!.id };
      if (!form.subject_id) delete payload.subject_id;
      if (editing) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        payload.slug = slugify(form.title);
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Course updated" : "Course created");
      qc.invalidateQueries({ queryKey: ["teacher-courses"] });
      setOpen(false); setEditing(null);
      setForm({ title: "", description: "", subject_id: "", level: "beginner", grade: "", is_published: false });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["teacher-courses"] }); },
  });

  if (!isEducator) {
    return (
      <AppShell>
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Teachers only</h1>
          <p className="mt-1 text-sm text-muted-foreground">You need a teacher account to access this page.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teach</h1>
          <p className="text-sm text-muted-foreground">Create and manage your courses.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ title: "", description: "", subject_id: "", level: "beginner", grade: "", is_published: false }); } }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary"><PlusCircle className="mr-2 h-4 w-4" /> New course</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit course" : "New course"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Subject</Label>
                <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Level</Label>
                  <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["beginner", "intermediate", "advanced"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Grade</Label><Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="e.g. Grade 10" /></div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><Label>Published</Label><p className="text-xs text-muted-foreground">Visible to students</p></div>
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => upsertCourse.mutate()} disabled={!form.title || upsertCourse.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {(courses ?? []).length === 0 ? (
        <Card className="border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No courses yet — create your first one.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses!.map((c: any) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-primary">{c.subjects?.name ?? "Course"}</div>
                  <h3 className="mt-1 font-semibold">{c.title}</h3>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.is_published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {c.is_published ? "Published" : "Draft"}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
              <div className="mt-4 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1"><Link to="/teacher/$courseId" params={{ courseId: c.id }}>Manage</Link></Button>
                <Button variant="outline" size="sm" onClick={() => { setEditing(c); setForm({ title: c.title, description: c.description ?? "", subject_id: c.subject_id ?? "", level: c.level ?? "beginner", grade: c.grade ?? "", is_published: c.is_published }); setOpen(true); }}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { if (confirm("Delete this course?")) deleteCourse.mutate(c.id); }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
