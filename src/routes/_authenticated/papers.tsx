import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Eye, Search, CheckCircle2, XCircle } from "lucide-react";
import { CAPS_SUBJECTS, GRADES, TERMS } from "@/lib/papers";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/papers")({
  component: PapersPage,
});

type Paper = {
  id: string;
  title: string;
  grade: number;
  subject: string;
  term: number;
  year: number;
  description: string | null;
  paper_url: string | null;
  paper_path: string | null;
  memo_url: string | null;
  memo_path: string | null;
};

async function resolveUrl(url: string | null, path: string | null): Promise<string | null> {
  if (url) return url;
  if (!path) return null;
  const { data, error } = await supabase.storage.from("question-papers").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

function PapersPage() {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<string>("all");
  const [subject, setSubject] = useState<string>("all");
  const [term, setTerm] = useState<string>("all");
  const [year, setYear] = useState<string>("all");

  const { data: papers = [], isLoading } = useQuery({
    queryKey: ["question_papers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_papers")
        .select("*")
        .order("year", { ascending: false })
        .order("grade", { ascending: false })
        .order("term");
      if (error) throw error;
      return data as Paper[];
    },
  });

  const years = useMemo(() => Array.from(new Set(papers.map((p) => p.year))).sort((a, b) => b - a), [papers]);
  const subjects = useMemo(() => {
    const set = new Set<string>(CAPS_SUBJECTS);
    papers.forEach((p) => set.add(p.subject));
    return Array.from(set).sort();
  }, [papers]);

  const filtered = papers.filter((p) => {
    if (grade !== "all" && String(p.grade) !== grade) return false;
    if (subject !== "all" && p.subject !== subject) return false;
    if (term !== "all" && String(p.term) !== term) return false;
    if (year !== "all" && String(p.year) !== year) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      if (
        !p.title.toLowerCase().includes(s) &&
        !p.subject.toLowerCase().includes(s) &&
        !(p.description ?? "").toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  async function openPaper(p: Paper, kind: "paper" | "memo") {
    const url = await resolveUrl(
      kind === "paper" ? p.paper_url : p.memo_url,
      kind === "paper" ? p.paper_path : p.memo_path,
    );
    if (!url) return toast.error("File not available");
    window.open(url, "_blank", "noopener");
  }

  async function download(p: Paper, kind: "paper" | "memo") {
    const url = await resolveUrl(
      kind === "paper" ? p.paper_url : p.memo_url,
      kind === "paper" ? p.paper_path : p.memo_path,
    );
    if (!url) return toast.error("File not available");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.subject}-Gr${p.grade}-T${p.term}-${p.year}${kind === "memo" ? "-MEMO" : ""}.pdf`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Question Papers</h1>
          <p className="text-muted-foreground">Past CAPS exam papers and memos, Grades 8–12.</p>
        </div>
      </div>

      <Card className="mb-6 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_repeat(4,minmax(0,140px))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search papers…" className="pl-9" />
          </div>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {GRADES.map((g) => <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All terms</SelectItem>
              {TERMS.map((t) => <SelectItem key={t} value={String(t)}>Term {t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No papers found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting the filters, or check back once admins upload papers.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="flex flex-col overflow-hidden p-5 transition hover:shadow-glow">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="rounded-lg bg-gradient-primary/10 p-2 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Grade {p.grade}</span>
                  <span className="rounded-full bg-accent/40 px-2 py-0.5">Term {p.term}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{p.year}</span>
                </div>
              </div>
              <h3 className="line-clamp-2 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.subject}</p>
              {p.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
              <div className="mt-3 flex items-center gap-1 text-xs">
                {p.memo_url || p.memo_path ? (
                  <><CheckCircle2 className="h-3 w-3 text-primary" /> Memo available</>
                ) : (
                  <><XCircle className="h-3 w-3 text-muted-foreground" /> <span className="text-muted-foreground">No memo</span></>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => openPaper(p, "paper")} disabled={!p.paper_url && !p.paper_path}>
                  <Eye className="mr-1 h-3 w-3" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={() => download(p, "paper")} disabled={!p.paper_url && !p.paper_path}>
                  <Download className="mr-1 h-3 w-3" /> Paper
                </Button>
                {(p.memo_url || p.memo_path) && (
                  <Button size="sm" variant="ghost" onClick={() => download(p, "memo")}>
                    <Download className="mr-1 h-3 w-3" /> Memo
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
