import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ReviewPatch {
  title: string;
  description: string;
  grade: number;
  subject: string;
  section: string;
  topic: string;
  subtopic: string;
  keywords: string[];
  search_tags: string[];
  objectives: string[];
}

function Confidence({ label, value }: { label: string; value: number | undefined }) {
  const v = value ?? 0;
  const tone = v >= 90 ? "text-emerald-500" : v >= 80 ? "text-primary" : "text-amber-500";
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tone}`}>{v}%</span>
    </div>
  );
}

export function ReviewForm({
  row,
  onPublish,
  submitLabel = "Approve & publish",
}: {
  row: any;
  onPublish: (patch: ReviewPatch) => void | Promise<void>;
  submitLabel?: string;
}) {
  const conf = (row.confidence ?? {}) as Record<string, number>;
  const [f, setF] = useState<ReviewPatch>({
    title: row.title ?? "",
    description: row.description ?? "",
    grade: row.grade ?? 11,
    subject: row.subject ?? "",
    section: row.section ?? "",
    topic: row.topic ?? "",
    subtopic: row.subtopic ?? "",
    keywords: row.keywords ?? [],
    search_tags: row.search_tags ?? [],
    objectives: row.objectives ?? [],
  });
  const [saving, setSaving] = useState(false);

  const invalid = !f.title.trim() || !f.subject.trim() || !f.grade;

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <div>
          <Label>Title</Label>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Grade</Label>
            <Input
              type="number"
              min={8}
              max={12}
              value={f.grade}
              onChange={(e) => setF({ ...f, grade: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </div>
          <div>
            <Label>Section</Label>
            <Input value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
          </div>
          <div>
            <Label>Topic</Label>
            <Input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Subtopic</Label>
            <Input value={f.subtopic} onChange={(e) => setF({ ...f, subtopic: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div>
          <Label>Learning objectives (one per line)</Label>
          <Textarea
            rows={4}
            value={f.objectives.join("\n")}
            onChange={(e) => setF({ ...f, objectives: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Keywords (comma separated)</Label>
            <Input
              value={f.keywords.join(", ")}
              onChange={(e) => setF({ ...f, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
          <div>
            <Label>Search tags (comma separated)</Label>
            <Input
              value={f.search_tags.join(", ")}
              onChange={(e) => setF({ ...f, search_tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            disabled={invalid || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onPublish(f);
              } finally {
                setSaving(false);
              }
            }}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> {saving ? "Saving…" : submitLabel}
          </Button>
          {invalid && <span className="self-center text-xs text-destructive">Title, grade and subject are required.</span>}
        </div>
      </div>

      <div className="space-y-2">
        {row.needs_confirmation && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> AI needs confirmation</div>
            <p className="mt-1 text-muted-foreground">
              At least one classification is below 80% confidence. Check and correct it before publishing.
            </p>
          </div>
        )}
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">AI confidence</div>
          <div className="space-y-1">
            <Confidence label="Grade" value={conf["grade"]} />
            <Confidence label="Subject" value={conf["subject"]} />
            <Confidence label="Section" value={conf["section"]} />
            <Confidence label="Topic" value={conf["topic"]} />
            <Confidence label="Subtopic" value={conf["subtopic"]} />
          </div>
        </div>
        {row.thumbnail_suggestion && (
          <div className="rounded-lg border p-3 text-xs">
            <div className="font-semibold">Thumbnail suggestion</div>
            <p className="mt-1 text-muted-foreground">{row.thumbnail_suggestion}</p>
          </div>
        )}
        {row.ai_analysis?.reasoning && (
          <div className="rounded-lg border p-3 text-xs">
            <div className="font-semibold">AI reasoning</div>
            <p className="mt-1 text-muted-foreground">{row.ai_analysis.reasoning}</p>
            <p className="mt-2 text-[10px] uppercase text-muted-foreground">Model: {row.ai_analysis.model}</p>
          </div>
        )}
        {row.transcript && (
          <details className="rounded-lg border p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Transcript</summary>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{row.transcript}</p>
          </details>
        )}
      </div>
    </div>
  );
}
