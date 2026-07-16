import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/courses/")({
  component: CoursesPage,
});

function CoursesPage() {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });
  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses", subject, q],
    queryFn: async () => {
      let query = supabase.from("courses").select("id, title, slug, description, cover_url, subjects(name, category)").eq("is_published", true);
      if (subject) query = query.eq("subject_id", subject);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data } = await query.order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Browse Courses</h1>
        <p className="text-sm text-muted-foreground">Learn any subject. Master tech skills. Explore what matters.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" className="pl-9" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => setSubject(null)} className={`rounded-full px-3 py-1.5 text-sm ${!subject ? "bg-gradient-primary text-primary-foreground" : "bg-card border"}`}>All</button>
        {(subjects ?? []).map((s) => (
          <button key={s.id} onClick={() => setSubject(s.id)} className={`rounded-full px-3 py-1.5 text-sm ${subject === s.id ? "bg-gradient-primary text-primary-foreground" : "bg-card border"}`}>
            {s.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Card key={i} className="h-40 animate-pulse" />)}
        </div>
      ) : courses && courses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c: any) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="group rounded-2xl border bg-gradient-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-elegant">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">{c.subjects?.name}</div>
              <h3 className="mt-2 text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{c.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed py-16 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No courses match your search. Try clearing filters.</p>
          <Button onClick={() => { setQ(""); setSubject(null); }} variant="outline" className="mt-4">Reset</Button>
        </div>
      )}
    </AppShell>
  );
}
