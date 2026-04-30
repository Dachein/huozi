import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { detectHuoziFormat } from "@/lib/html/detect-format";
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
  // Rendered inline (no iframe). The wrapper applies a per-format display
  // box (read from `<meta name="huozi:viewport">` when present, else
  // sniffed from the .huozi-{format} class), and overrides the template
  // root class so it fills that box. Inside the template, slide layout
  // uses container queries (cqh/cqw) which scope to the template root —
  // so the same bytes look correct in published view (root = 100vw×100vh),
  // workspace inline preview (root = sized wrapper), and Fullscreen
  // (FullscreenContent overrides the wrapper to viewport).
  if (ext === "html" || ext === "htm") {
    const { html } = processHtmlDirect(processChartComponents(content), {
      scopeTo: ".huozi-html-host",
    });
    const layout = pickHtmlLayout(content);
    return (
      <div
        className={`huozi-html-host block ${layout.className}`}
        style={layout.style}
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
 * Pick the inline-preview wrapper sizing for a published HTML file.
 *
 * Priority:
 *   1. `<meta name="huozi:viewport" content="aspect-ratio:16/9; max-width:360px; max-height:80vh">`
 *      Custom HTML authors can opt in to format-aware sizing by adding this
 *      meta. Recognized keys: aspect-ratio, max-width, max-height.
 *   2. Fallback: sniff the .huozi-{deck,story,paper} class on the body root
 *      so the standard 5 templates work without authoring meta.
 *   3. Otherwise: a sensible scrollable box (mobile / page / unknown).
 *
 * The wrapper className also forces the template root (.huozi-deck etc.)
 * to fill the wrapper via Tailwind arbitrary variants. The template root
 * defaults to 100vw × 100vh (correct for published view) — these
 * overrides scope it to the workspace embed.
 */
function pickHtmlLayout(rawContent: string): HtmlLayout {
  const meta = parseHuoziViewport(rawContent);
  const format = detectHuoziFormat(rawContent);

  const style: React.CSSProperties = { width: "100%" };
  let cls = "";

  // Apply meta hints first (explicit > sniff).
  if (meta?.["aspect-ratio"]) style.aspectRatio = meta["aspect-ratio"];
  if (meta?.["max-width"]) {
    style.maxWidth = meta["max-width"];
    style.marginLeft = "auto";
    style.marginRight = "auto";
  }
  if (meta?.["max-height"]) {
    style.height = meta["max-height"];
    style.overflowY = "auto";
  }

  // Format-specific overrides: force the template root to fill the wrapper.
  if (format === "deck") {
    if (!meta?.["aspect-ratio"]) style.aspectRatio = "16 / 9";
    cls =
      "[&_.huozi-deck]:!w-full [&_.huozi-deck]:!h-full [&_.huozi-deck]:!min-h-0";
  } else if (format === "story") {
    if (!meta?.["aspect-ratio"]) style.aspectRatio = "9 / 16";
    if (!meta?.["max-width"]) {
      style.maxWidth = "360px";
      style.marginLeft = "auto";
      style.marginRight = "auto";
    }
    cls =
      "[&_.huozi-story]:!w-full [&_.huozi-story]:!h-full [&_.huozi-story]:!min-h-0";
  } else if (format === "paper") {
    if (!meta?.["max-height"]) {
      style.height = "min(80vh, 800px)";
      style.overflowY = "auto";
    }
    // Paper grows to content; wrapper provides the scroll box.
    cls = "[&_.huozi-paper]:!min-h-0";
  } else if (format === "mobile" || format === "web") {
    // Long-flow templates: let the page extend naturally. Workspace's main
    // column already scrolls, so wrapping in a fixed-height scroll box just
    // makes a window-in-a-window. Only the paginated formats (deck / story /
    // paper) need a constraint to keep one "page" visible at a time.
    cls =
      format === "mobile"
        ? "[&_.huozi-mobile]:!min-h-0"
        : "[&_.huozi-web]:!min-h-0";
  } else if (!meta?.["aspect-ratio"] && !meta?.["max-height"]) {
    // Unknown HTML, no meta → also let it flow naturally. The host page
    // (workspace) handles the scroll; no need for a nested 80vh box.
  }

  return { className: cls, style };
}

function parseHuoziViewport(html: string): Record<string, string> | null {
  const m = html.match(
    /<meta\s+name=["']huozi:viewport["']\s+content=["']([^"']+)["']/i,
  );
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const part of m[1].split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
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

