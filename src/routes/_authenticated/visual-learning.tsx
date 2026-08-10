import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Play, ChevronRight, Video } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visual-learning")({
  component: VisualLearningPage,
  head: () => ({
    meta: [
      { title: "Visual Learning – CAPS Video Lessons | Learn Chief" },
      { name: "description", content: "Browse and search CAPS video lessons by grade, subject, section and topic, then watch or download them for offline study." },
      { property: "og:title", content: "Visual Learning – CAPS Video Lessons" },
      { property: "og:description", content: "Grade 9–12 CAPS video lessons you can watch online or download for offline study." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function VisualLearningPage() {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const searching = q.trim().length > 1;

  const { data: results = [] } = useQuery({
    queryKey: ["visual_learning", "search", q, grade],
    enabled: searching,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_learning_content", {
        _q: q.trim(),
        _grade: grade,
        _content_type: "video",
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: all = [] } = useQuery({
    queryKey: ["visual_learning", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_content")
        .select("id, title, description, grade, subject, section, topic, subtopic, duration_seconds")
        .eq("content_type", "video")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
  const inGrade = all.filter((v) => v.grade === grade);
  const inSubject = inGrade.filter((v) => v.subject === subject);
  const inSection = inSubject.filter((v) => v.section === section);
  const inTopic = inSection.filter((v) => v.topic === topic);

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">🎥 Visual Learning</h1>
      <p className="mt-1 text-sm text-muted-foreground">CAPS video lessons — watch online or download for offline study.</p>

      <div className="relative mt-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search e.g. Newton's Laws, photosynthesis…" className="pl-9" />
      </div>

      {searching ? (
        <div className="mt-6 space-y-3">
          <div className="text-sm text-muted-foreground">{results.length} result(s) for “{q}”</div>
          {results.map((v) => <VideoRow key={v.id} v={v} />)}
          {results.length === 0 && <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">Nothing matched that search yet.</Card>}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <Breadcrumbs
            crumbs={[
              grade ? { label: `Grade ${grade}`, onClick: () => { setSubject(null); setSection(null); setTopic(null); } } : null,
              subject ? { label: subject, onClick: () => { setSection(null); setTopic(null); } } : null,
              section ? { label: section, onClick: () => setTopic(null) } : null,
              topic ? { label: topic, onClick: () => undefined } : null,
            ].filter(Boolean) as any}
            onReset={() => { setGrade(null); setSubject(null); setSection(null); setTopic(null); }}
          />

          {!grade && (
            <Tiles
              items={[9, 10, 11, 12].map((g) => ({
                key: String(g),
                label: `Grade ${g}`,
                sub: `${all.filter((v) => v.grade === g).length} videos`,
                onClick: () => setGrade(g),
              }))}
            />
          )}
          {grade && !subject && (
            <Tiles
              items={uniq(inGrade.map((v) => v.subject)).map((s) => ({
                key: s,
                label: s,
                sub: `${inGrade.filter((v) => v.subject === s).length} videos`,
                onClick: () => setSubject(s),
              }))}
              empty="No videos published for this grade yet."
            />
          )}
          {grade && subject && !section && (
            <Tiles
              items={uniq(inSubject.map((v) => v.section)).map((s) => ({
                key: s,
                label: s,
                sub: `${inSubject.filter((v) => v.section === s).length} videos`,
                onClick: () => setSection(s),
              }))}
              empty="No sections yet."
            />
          )}
          {grade && subject && section && !topic && (
            <Tiles
              items={uniq(inSection.map((v) => v.topic)).map((t) => ({
                key: t,
                label: t,
                sub: `${inSection.filter((v) => v.topic === t).length} videos`,
                onClick: () => setTopic(t),
              }))}
              empty="No topics yet."
            />
          )}
          {grade && subject && section && topic && (
            <div className="space-y-3">{inTopic.map((v) => <VideoRow key={v.id} v={v} />)}</div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Breadcrumbs({ crumbs, onReset }: { crumbs: { label: string; onClick: () => void }[]; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={onReset} className="font-medium text-primary hover:underline">All grades</button>
      {crumbs.map((c) => (
        <span key={c.label} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <button onClick={c.onClick} className="hover:underline">{c.label}</button>
        </span>
      ))}
    </div>
  );
}

function Tiles({ items, empty }: { items: { key: string; label: string; sub: string; onClick: () => void }[]; empty?: string }) {
  if (items.length === 0) return <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">{empty ?? "Nothing here yet."}</Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <button key={i.key} onClick={i.onClick} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-glow">
          <div className="font-semibold">{i.label}</div>
          <div className="text-xs text-muted-foreground">{i.sub}</div>
        </button>
      ))}
    </div>
  );
}

function VideoRow({ v }: { v: any }) {
  const mins = v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)} min` : null;
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          <span className="font-semibold">{v.title}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {[v.grade ? `Grade ${v.grade}` : null, v.subject, v.section, v.topic, v.subtopic].filter(Boolean).join(" → ")}
          {mins ? ` · ${mins}` : ""}
        </div>
        {v.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{v.description}</p>}
      </div>
      <Button asChild size="sm">
        <Link to="/watch/$contentId" params={{ contentId: v.id }}><Play className="mr-2 h-3 w-3" /> Watch</Link>
      </Button>
    </Card>
  );
}
