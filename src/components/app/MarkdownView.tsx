import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Lightbulb, AlertTriangle, Info, Sparkles, GraduationCap, BookOpen, Sigma, CheckCircle2, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  children: string;
  className?: string;
} & Omit<Options, "children">;

type CalloutKind =
  | "tip" | "note" | "warning" | "important" | "did-you-know"
  | "example" | "formula" | "definition" | "exam-tip" | "teacher"
  | "objectives" | "summary" | "takeaway" | "vocab";

const CALLOUT_META: Record<CalloutKind, { label: string; icon: ReactNode; classes: string }> = {
  tip:            { label: "Tip",              icon: <Lightbulb className="h-4 w-4" />,     classes: "border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-100" },
  note:           { label: "Note",             icon: <StickyNote className="h-4 w-4" />,    classes: "border-blue-400/40 bg-blue-500/10 text-blue-900 dark:text-blue-100" },
  warning:        { label: "Warning",          icon: <AlertTriangle className="h-4 w-4" />, classes: "border-red-400/40 bg-red-500/10 text-red-900 dark:text-red-100" },
  important:      { label: "Important",        icon: <Info className="h-4 w-4" />,          classes: "border-violet-400/40 bg-violet-500/10 text-violet-900 dark:text-violet-100" },
  "did-you-know": { label: "Did you know?",    icon: <Sparkles className="h-4 w-4" />,      classes: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-900 dark:text-fuchsia-100" },
  example:        { label: "Worked example",   icon: <BookOpen className="h-4 w-4" />,      classes: "border-emerald-400/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100" },
  formula:        { label: "Formula",          icon: <Sigma className="h-4 w-4" />,         classes: "border-primary/40 bg-primary/10 text-foreground" },
  definition:     { label: "Definition",       icon: <BookOpen className="h-4 w-4" />,      classes: "border-sky-400/40 bg-sky-500/10 text-sky-900 dark:text-sky-100" },
  "exam-tip":     { label: "Exam tip",         icon: <GraduationCap className="h-4 w-4" />, classes: "border-orange-400/40 bg-orange-500/10 text-orange-900 dark:text-orange-100" },
  teacher:        { label: "Teacher note",     icon: <GraduationCap className="h-4 w-4" />, classes: "border-slate-400/40 bg-slate-500/10 text-foreground" },
  objectives:     { label: "Learning objectives", icon: <CheckCircle2 className="h-4 w-4" />, classes: "border-primary/40 bg-gradient-primary/10 text-foreground" },
  summary:        { label: "Summary",          icon: <BookOpen className="h-4 w-4" />,      classes: "border-primary/40 bg-primary/5 text-foreground" },
  takeaway:       { label: "Key takeaway",     icon: <CheckCircle2 className="h-4 w-4" />,  classes: "border-emerald-500/40 bg-emerald-500/10 text-foreground" },
  vocab:          { label: "Vocabulary",       icon: <BookOpen className="h-4 w-4" />,      classes: "border-teal-400/40 bg-teal-500/10 text-teal-900 dark:text-teal-100" },
};

const KIND_ALIASES: Record<string, CalloutKind> = {
  tip: "tip", info: "note", note: "note", warn: "warning", warning: "warning",
  important: "important", danger: "warning", caution: "warning",
  "did-you-know": "did-you-know", didyouknow: "did-you-know", fact: "did-you-know",
  example: "example", worked: "example", "worked-example": "example",
  formula: "formula", equation: "formula",
  definition: "definition", def: "definition",
  "exam-tip": "exam-tip", exam: "exam-tip",
  teacher: "teacher", "teacher-note": "teacher",
  objectives: "objectives", objective: "objectives", goals: "objectives",
  summary: "summary", recap: "summary",
  takeaway: "takeaway", "key-takeaway": "takeaway", key: "takeaway",
  vocab: "vocab", vocabulary: "vocab", glossary: "vocab",
};

// Convert :::kind [title]\n ... \n::: fenced callouts to HTML divs the renderer will style.
// Also normalizes LaTeX \( \) and \[ \] delimiters into $...$ / $$...$$.
function preprocess(md: string): string {
  const normalized = (md ?? "")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => `\n$$${expr}$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => `$${expr}$`);

  return normalized.replace(
    /^:::\s*([a-zA-Z][\w-]*)(?:\s+([^\n]+))?\n([\s\S]*?)\n:::\s*$/gm,
    (_, rawKind: string, title: string | undefined, body: string) => {
      const kind = KIND_ALIASES[rawKind.toLowerCase()] ?? "note";
      const t = (title ?? "").trim();
      // Use a fenced div via a bespoke HTML wrapper markdown extension: we emit
      // a plain HTML block that our components will detect by data-callout attr.
      const safeTitle = t ? t.replace(/"/g, "&quot;") : "";
      return `\n<div data-callout="${kind}" data-title="${safeTitle}">\n\n${body.trim()}\n\n</div>\n`;
    },
  );
}

function Callout({ kind, title, children }: { kind: CalloutKind; title?: string; children: ReactNode }) {
  const meta = CALLOUT_META[kind];
  return (
    <div className={cn("my-5 rounded-xl border p-4 shadow-sm", meta.classes)}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/60">{meta.icon}</span>
        <span>{title || meta.label}</span>
      </div>
      <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </div>
  );
}

export function MarkdownView({ children, className, ...rest }: Props) {
  const source = preprocess(children ?? "");

  return (
    <div
      className={cn(
        // Rich typography scoped so it always looks like a textbook without needing @tailwindcss/typography.
        "text-[15px] leading-7 text-foreground",
        "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight",
        "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:border-b [&_h2]:pb-2",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold",
        "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:text-muted-foreground",
        "[&_p]:my-3",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul_li]:my-1",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol_li]:my-1",
        "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_blockquote]:my-4 [&_blockquote]:rounded-r-lg [&_blockquote]:border-l-4 [&_blockquote]:border-primary/60 [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:italic",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:font-mono",
        "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:bg-[oklch(0.16_0.03_265)] [&_pre]:p-4 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100",
        "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg [&_table]:border [&_table]:text-sm",
        "[&_thead]:bg-muted/60 [&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:px-3 [&_td]:py-2 [&_tr:nth-child(even)]:bg-muted/30",
        "[&_img]:my-5 [&_img]:mx-auto [&_img]:max-h-[520px] [&_img]:rounded-xl [&_img]:border [&_img]:shadow-card",
        "[&_hr]:my-8 [&_hr]:border-border",
        "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: "html" }]]}
        components={{
          div: ({ node, className: cls, children, ...props }: any) => {
            const kind = props["data-callout"] as CalloutKind | undefined;
            if (kind && CALLOUT_META[kind]) {
              return <Callout kind={kind} title={props["data-title"]}>{children}</Callout>;
            }
            return <div className={cls} {...props}>{children}</div>;
          },
        }}
        {...rest}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
