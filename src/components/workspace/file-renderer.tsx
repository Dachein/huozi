import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { CsvGrid } from "@/components/csv-grid";

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
  // Rendered inside an iframe so vh / vw inside the published HTML reference
  // the iframe's box (not the workspace viewport). Required for the
  // paginated formats (deck / story / paper) which size slides via vh / vw.
  if (ext === "html" || ext === "htm") {
    const { html } = processHtmlDirect(processChartComponents(content));
    const layout = detectHtmlLayout(html);
    return (
      <iframe
        srcDoc={html}
        title="HTML preview"
        className={`block border border-border rounded-lg bg-background ${layout.className}`}
        style={layout.style}
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
    return <CsvGrid content={content} delim={ext === "tsv" ? "\t" : ","} />;
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

interface HtmlLayout {
  className: string;
  style: React.CSSProperties;
}

/**
 * Sniff which huozi format an HTML file uses (by class name on the body
 * wrapper) and pick an iframe size that mirrors the published viewing
 * experience.
 *
 *   deck  (16:9) → full width, aspect-ratio locked
 *   story (9:16) → narrow column centered, aspect-ratio locked
 *   paper (A4)  → full width, fixed scrollable height
 *   other       → streaming long-form: full width, fixed scrollable height
 *
 * In fullscreen the FullscreenContent shell overrides these via
 * `!w-full !h-full !aspect-auto` so the iframe truly fills the viewport.
 */
function detectHtmlLayout(html: string): HtmlLayout {
  if (/class="[^"]*\bhuozi-deck\b/.test(html)) {
    return { className: "w-full", style: { aspectRatio: "16 / 9" } };
  }
  if (/class="[^"]*\bhuozi-story\b/.test(html)) {
    return {
      className: "mx-auto",
      style: { width: "min(360px, 100%)", aspectRatio: "9 / 16" },
    };
  }
  if (/class="[^"]*\bhuozi-paper\b/.test(html)) {
    return { className: "w-full", style: { height: "min(80vh, 800px)" } };
  }
  return { className: "w-full", style: { height: "min(80vh, 600px)" } };
}

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

