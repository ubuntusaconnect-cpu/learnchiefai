import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PlayCircle, FileText, CheckCircle2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/courses/$courseId")({
  component: CourseDetail,
});

function CourseDetail() {
  const { courseId } = Route.useParams();
  const { data: user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*, subjects(name), modules(id, title, position, lessons(id, title, position, duration_minutes))")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrolled } = useQuery({
    queryKey: ["enrolled", user?.id, courseId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("id").eq("user_id", user!.id).eq("course_id", courseId).maybeSingle();
      return !!data;
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("enrollments").insert({ user_id: user!.id, course_id: courseId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled!");
      qc.invalidateQueries({ queryKey: ["enrolled"] });
      qc.invalidateQueries({ queryKey: ["enrollments"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <AppShell><Card className="h-64 animate-pulse" /></AppShell>;
  if (!course) return <AppShell><p>Course not found. <Link to="/courses" className="text-primary underline">Back</Link></p></AppShell>;

  const modules = (course.modules ?? []).sort((a: any, b: any) => a.position - b.position);
  const firstLesson = modules.find((m: any) => m.lessons?.length)?.lessons?.[0];

  return (
    <AppShell>
      <button onClick={() => navigate({ to: "/courses" })} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </button>

      <Card className="overflow-hidden bg-gradient-hero p-8 text-white shadow-elegant">
        <div className="text-xs uppercase tracking-wider text-primary-glow">{course.subjects?.name}</div>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">{course.title}</h1>
        <p className="mt-3 max-w-2xl text-white/70">{course.description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {enrolled ? (
            firstLesson ? (
              <Button asChild size="lg" className="bg-white text-brand hover:bg-white/90">
                <Link to="/lessons/$lessonId" params={{ lessonId: firstLesson.id }}>Continue Learning</Link>
              </Button>
            ) : <Button size="lg" disabled className="bg-white/20">No lessons yet</Button>
          ) : (
            <Button size="lg" className="bg-white text-brand hover:bg-white/90" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
              {enroll.isPending ? "Enrolling…" : "Enroll for Free"}
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Course content</h2>
        {modules.length === 0 ? (
          <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
            The teacher hasn't added modules yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {modules.map((m: any) => (
              <Card key={m.id} className="p-5">
                <h3 className="font-semibold">{m.title}</h3>
                <div className="mt-3 divide-y">
                  {(m.lessons ?? []).sort((a: any, b: any) => a.position - b.position).map((l: any) => (
                    <Link key={l.id} to="/lessons/$lessonId" params={{ lessonId: l.id }} className="flex items-center justify-between py-3 hover:text-primary">
                      <div className="flex items-center gap-3">
                        <PlayCircle className="h-4 w-4" />
                        <span className="text-sm">{l.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{l.duration_minutes ?? 0} min</span>
                    </Link>
                  ))}
                  {(!m.lessons || m.lessons.length === 0) && (
                    <div className="py-3 text-sm text-muted-foreground">No lessons in this module.</div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
