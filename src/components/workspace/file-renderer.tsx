import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { CsvTable } from "@/components/csv-table";

/**
 * Renders a file's content based on its extension.
 *
 * Server component — delegates to the existing huozi.app renderers
 * (the same ones powering published pages) so MD / HTML look identical to
 * what users already see on huozi.app/{workspace}/{slug}.
 *
 * Returns a JSX fragment ready to drop into the workspace view.
 */
export interface FileRendererProps {
  path: string;
  /** Raw content — already stripped of `cat -n` prefixes. */
  content: string;
  /** When true, force raw/source view regardless of file type. */
  raw?: boolean;
}

function getExt(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) return "";
  return path.slice(i + 1).toLowerCase();
}

export async function FileRenderer({ path, content, raw }: FileRendererProps) {
  const ext = getExt(path);

  if (raw) {
    return <SourceBlock content={content} />;
  }

  // Markdown — use the same renderMarkdown as publish flow.
  if (ext === "md" || ext === "mdx") {
    const html = await renderMarkdown(content);
    return (
      <article
        className="prose prose-sm sm:prose-base max-w-none break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // HTML — sanitize + chart processing, same as publish flow.
  if (ext === "html" || ext === "htm") {
    const { html } = processHtmlDirect(processChartComponents(content));
    return (
      <div
        className="rendered-html max-w-none"
        // Same sanitizer as publish; safe.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // JSON — pretty-print.
  if (ext === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // leave as-is if unparseable
    }
    return <SourceBlock content={pretty} mono />;
  }

  // CSV / TSV — interactive table view.
  if (ext === "csv" || ext === "tsv") {
    return <CsvTable content={content} delim={ext === "tsv" ? "\t" : ","} />;
  }

  // Everything else: show as source. Code files get monospace + light wrap.
  const CODE_EXTS = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rb", "go", "rs", "java", "swift", "kt",
    "c", "cpp", "h", "hpp", "cs",
    "sh", "bash", "zsh", "fish", "ps1",
    "yml", "yaml", "toml", "ini",
    "sql", "graphql",
  ]);
  const isCode = CODE_EXTS.has(ext);
  return <SourceBlock content={content} mono={isCode} />;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function SourceBlock({
  content,
  mono = false,
}: {
  content: string;
  mono?: boolean;
}) {
  return (
    <pre
      className={`rounded-lg border border-border bg-muted p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words ${mono ? "font-mono" : ""}`}
    >
      {content}
    </pre>
  );
}

