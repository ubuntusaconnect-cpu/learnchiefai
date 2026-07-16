import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type Props = {
  children: string;
  className?: string;
} & Omit<Options, "children">;

/**
 * Shared markdown renderer with math (KaTeX) + GFM support.
 * Handles $...$ and $$...$$ as well as \( \) / \[ \] delimiters via remark-math.
 */
export function MarkdownView({ children, className, ...rest }: Props) {
  // Normalize common LaTeX delimiters that remark-math doesn't parse by default
  // so authored content like \(x\) or \[x\] renders as math.
  const normalized = (children ?? "")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => `\n$$${expr}$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => `$${expr}$`);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: "html" }]]}
        {...rest}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
