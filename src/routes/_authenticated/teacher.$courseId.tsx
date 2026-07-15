import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, PlusCircle, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teacher/$courseId")({
  component: ManageCourse,
});

function ManageCourse() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const { data: course } = useQuery({
    queryKey: ["manage-course", courseId],
    queryFn: async () => (await supabase.from("courses").select("*, modules(id, title, position, lessons(id, title, position, video_url, content, duration_minutes))").eq("id", courseId).maybeSingle()).data,
  });

  const [modOpen, setModOpen] = useState(false);
  const [modTitle, setModTitle] = useState("");
  const [lessonOpen, setLessonOpen] = useState<string | null>(null);
  const [lesson, setLesson] = useState({ title: "", content: "", video_url: "", duration_minutes: 10 });

  const addModule = useMutation({
    mutationFn: async () => {
      const nextPos = (course?.modules?.length ?? 0);
      const { error } = await supabase.from("modules").insert({ course_id: courseId, title: modTitle, position: nextPos });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Module added"); setModOpen(false); setModTitle(""); qc.invalidateQueries({ queryKey: ["manage-course"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addLesson = useMutation({
    mutationFn: async (moduleId: string) => {
      const mod = course!.modules.find((m: any) => m.id === moduleId);
      const nextPos = (mod?.lessons?.length ?? 0);
      const { error } = await supabase.from("lessons").insert({ ...lesson, module_id: moduleId, position: nextPos });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lesson added"); setLessonOpen(null); setLesson({ title: "", content: "", video_url: "", duration_minutes: 10 }); qc.invalidateQueries({ queryKey: ["manage-course"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async ({ table, id }: { table: "modules" | "lessons"; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manage-course"] }); },
  });

  if (!course) return <AppShell><Card className="h-40 animate-pulse" /></AppShell>;
  const modules = (course.modules ?? []).sort((a: any, b: any) => a.position - b.position);

  return (
    <AppShell>
      <Link to="/teacher" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{course.title}</h1>
          <p className="text-sm text-muted-foreground">Manage modules and lessons</p>
        </div>
        <Dialog open={modOpen} onOpenChange={setModOpen}>
          <DialogTrigger asChild><Button><PlusCircle className="mr-2 h-4 w-4" /> Add module</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New module</DialogTitle></DialogHeader>
            <Label>Title</Label>
            <Input value={modTitle} onChange={(e) => setModTitle(e.target.value)} />
            <DialogFooter><Button onClick={() => addModule.mutate()} disabled={!modTitle}>Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {modules.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">No modules yet.</Card>
      ) : (
        <div className="space-y-4">
          {modules.map((m: any) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{m.title}</h3>
                <div className="flex gap-2">
                  <Dialog open={lessonOpen === m.id} onOpenChange={(v) => setLessonOpen(v ? m.id : null)}>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><PlusCircle className="mr-1 h-3 w-3" /> Lesson</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>New lesson</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div><Label>Title</Label><Input value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} /></div>
                        <div><Label>Video URL (optional)</Label><Input placeholder="https://www.youtube.com/watch?v=…" value={lesson.video_url} onChange={(e) => setLesson({ ...lesson, video_url: e.target.value })} /></div>
                        <div><Label>Content (Markdown)</Label><Textarea rows={6} value={lesson.content} onChange={(e) => setLesson({ ...lesson, content: e.target.value })} /></div>
                        <div><Label>Duration (min)</Label><Input type="number" value={lesson.duration_minutes} onChange={(e) => setLesson({ ...lesson, duration_minutes: Number(e.target.value) })} /></div>
                      </div>
                      <DialogFooter><Button onClick={() => addLesson.mutate(m.id)} disabled={!lesson.title}>Add lesson</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete module and all lessons?")) del.mutate({ table: "modules", id: m.id }); }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 divide-y">
                {(m.lessons ?? []).sort((a: any, b: any) => a.position - b.position).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between py-2">
                    <div className="text-sm">{l.title} <span className="text-xs text-muted-foreground">· {l.duration_minutes} min</span></div>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate({ table: "lessons", id: l.id })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                ))}
                {(!m.lessons || m.lessons.length === 0) && <p className="py-2 text-xs text-muted-foreground">No lessons in this module.</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
