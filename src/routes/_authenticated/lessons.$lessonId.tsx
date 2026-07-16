import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MarkdownView } from "@/components/app/MarkdownView";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { useSession, useRoles, primaryRole } from "@/lib/roles";
import { enhanceLesson } from "@/lib/lessons.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Bookmark, ArrowLeft, Clock, ListTree, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lessons/$lessonId")({
  component: LessonPage,
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractHeadings(md: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const line of (md ?? "").split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    let id = slugify(m[1]);
    let i = 2;
    while (seen.has(id)) id = `${slugify(m[1])}-${i++}`;
    seen.add(id);
    out.push({ id, text: m[1] });
  }
  return out;
}


function LessonPage() {
  const { lessonId } = Route.useParams();
  const { data: user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const canEnhance = primaryRole(roles) === "admin" || primaryRole(roles) === "teacher";
  const qc = useQueryClient();
  const enhanceFn = useServerFn(enhanceLesson);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lessons")
        .select("*, modules(id, title, course_id, courses(id, title))")
        .eq("id", lessonId)
        .maybeSingle();
      return data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["lesson-progress", user?.id, lessonId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("lesson_progress").select("*").eq("user_id", user!.id).eq("lesson_id", lessonId).maybeSingle();
      return data;
    },
  });

  const { data: bookmark } = useQuery({
    queryKey: ["bookmark", user?.id, lessonId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("bookmarks").select("id").eq("user_id", user!.id).eq("lesson_id", lessonId).maybeSingle();
      return data;
    },
  });

  const markComplete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lesson_progress").upsert({
        user_id: user!.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString(),
      }, { onConflict: "user_id,lesson_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked complete!"); qc.invalidateQueries({ queryKey: ["lesson-progress"] }); qc.invalidateQueries({ queryKey: ["progress-count"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleBookmark = useMutation({
    mutationFn: async () => {
      if (bookmark) {
        await supabase.from("bookmarks").delete().eq("id", bookmark.id);
      } else {
        await supabase.from("bookmarks").insert({ user_id: user!.id, lesson_id: lessonId });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookmark"] }); qc.invalidateQueries({ queryKey: ["bookmarks-list"] }); },
  });

  if (isLoading) return <AppShell><Card className="h-96 animate-pulse" /></AppShell>;
  if (!lesson) return <AppShell><p>Lesson not found.</p></AppShell>;

  return (
    <AppShell>
      <Link to="/courses/$courseId" params={{ courseId: lesson.modules.course_id }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to {lesson.modules.courses.title}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary">{lesson.modules.title}</div>
          <h1 className="mt-2 text-3xl font-bold">{lesson.title}</h1>

          {lesson.video_url && (
            <div className="mt-6 aspect-video overflow-hidden rounded-2xl border bg-black">
              {/^https?:\/\//.test(lesson.video_url) && lesson.video_url.includes("youtube") ? (
                <iframe src={lesson.video_url.replace("watch?v=", "embed/")} className="h-full w-full" allowFullScreen />
              ) : (
                <video src={lesson.video_url} controls className="h-full w-full" />
              )}
            </div>
          )}

          <Card className="mt-6 p-6">
            <MarkdownView className="prose prose-sm max-w-none dark:prose-invert">
              {lesson.content ?? "_Notes coming soon._"}
            </MarkdownView>
          </Card>
        </div>

        <aside className="space-y-3">
          <Card className="p-5">
            <h3 className="font-semibold">Your progress</h3>
            <Button className="mt-3 w-full" disabled={progress?.completed || markComplete.isPending} onClick={() => markComplete.mutate()}>
              {progress?.completed ? (<><CheckCircle2 className="mr-2 h-4 w-4" /> Completed</>) : "Mark as complete"}
            </Button>
            <Button variant="outline" className="mt-2 w-full" onClick={() => toggleBookmark.mutate()}>
              <Bookmark className={`mr-2 h-4 w-4 ${bookmark ? "fill-primary text-primary" : ""}`} /> {bookmark ? "Bookmarked" : "Bookmark"}
            </Button>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold">Need help?</h3>
            <p className="mt-1 text-xs text-muted-foreground">Ask the AI Study Assistant about this lesson.</p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/assistant" search={{ topic: lesson.title }}>Open AI Assistant</Link>
            </Button>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
