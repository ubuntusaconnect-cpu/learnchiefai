import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { BookOpen, Search as SearchIcon, PlayCircle, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: z.object({ q: z.string().optional() }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const term = (q ?? "").trim();

  const { data, isLoading } = useQuery({
    queryKey: ["search", term],
    enabled: term.length > 0,
    queryFn: async () => {
      const like = `%${term}%`;
      const [subjects, courses, lessons] = await Promise.all([
        supabase.from("subjects").select("id, name, slug, description").ilike("name", like).limit(10),
        supabase.from("courses").select("id, title, description, subjects(name)").eq("is_published", true).or(`title.ilike.${like},description.ilike.${like}`).limit(20),
        supabase.from("lessons").select("id, title, modules(title, courses(id, title, is_published))").ilike("title", like).limit(20),
      ]);
      return { subjects: subjects.data ?? [], courses: courses.data ?? [], lessons: (lessons.data ?? []).filter((l: any) => l.modules?.courses?.is_published) };
    },
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><SearchIcon className="h-6 w-6" /> Search</h1>
        {term && <p className="text-sm text-muted-foreground">Results for "<strong>{term}</strong>"</p>}
      </div>
      {!term ? (
        <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">Use the top bar to search subjects, courses, and lessons.</Card>
      ) : isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : (
        <div className="space-y-8">
          <Section icon={Layers} title="Subjects" empty="No matching subjects.">
            {data?.subjects.map((s) => (
              <Card key={s.id} className="p-4"><div className="font-semibold">{s.name}</div><p className="text-xs text-muted-foreground">{s.description}</p></Card>
            ))}
          </Section>
          <Section icon={BookOpen} title="Courses" empty="No matching courses.">
            {data?.courses.map((c: any) => (
              <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="block">
                <Card className="p-4 transition hover:shadow-card"><div className="text-xs text-primary">{c.subjects?.name}</div><div className="font-semibold">{c.title}</div><p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p></Card>
              </Link>
            ))}
          </Section>
          <Section icon={PlayCircle} title="Lessons" empty="No matching lessons.">
            {data?.lessons.map((l: any) => (
              <Link key={l.id} to="/lessons/$lessonId" params={{ lessonId: l.id }} className="block">
                <Card className="p-4 transition hover:shadow-card"><div className="text-xs text-primary">{l.modules?.courses?.title} · {l.modules?.title}</div><div className="font-semibold">{l.title}</div></Card>
              </Link>
            ))}
          </Section>
        </div>
      )}
    </AppShell>
  );
}

function Section({ icon: Icon, title, empty, children }: any) {
  const items = Array.isArray(children) ? children : [children];
  const has = items.filter(Boolean).length > 0;
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Icon className="h-4 w-4" /> {title}</h2>
      {has ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}
