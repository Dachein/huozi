import { cookies } from "next/headers";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { computeHtmlMeta, type HtmlMeta } from "@/lib/html/meta";
import { validateHuoziHtml } from "@/lib/html/validate";
import { cloudFetch } from "@/lib/cloud-fetch";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { CsvGrid } from "@/components/csv-grid";
import { CollectionView } from "@/components/collection-view";
import { EditableSurface } from "@/components/workspace/inline-edit";
import type { ObjectKind } from "@/components/workspace/inline-edit";
import { HighlightLayer } from "@/components/workspace/highlights/highlight-layer";
import { HighlightsDrawer } from "@/components/workspace/highlights/highlights-drawer";
import { HtmlValidationBanner } from "@/components/workspace/html-validation-banner";
import { HtmlCanvasFrame } from "@/components/workspace/html-canvas-frame";
import { resolveCanvas } from "@/lib/html/canvas";

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
  /**
   * When true, wrap renderable types in an EditableSurface so the user
   * can select text and run an inline edit. Defaults to false; the
   * workspace view enables it, the public `/p/<slug>` viewer leaves it
   * off so unauthenticated readers don't see the affordance.
   */
  inlineEditable?: boolean;
  /**
   * blob_sha the page already observed during SSR. Threaded down to the
   * EditModal so a save POST can include it as the freshness proof —
   * the Worker uses it to skip the Read-first round-trip, halving the
   * perceived save latency. `null` = unknown (e.g. binary read paths
   * that don't surface a sha); the modal then falls back to the slower
   * Read-first path.
   */
  parentBlobSha?: string | null;
  /**
   * Pre-computed format / pages / tabs / refreshMs from `computeHtmlMeta`.
   * Callers that already ran the scan (workspace view page, which needs
   * format + pages for its header chrome) pass them in so the renderer
   * skips re-scanning the same HTML 4 times. Optional — when missing the
   * renderer falls back to a local `computeHtmlMeta(content)`.
   */
  htmlMeta?: HtmlMeta;
}

function getExt(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) return "";
  return path.slice(i + 1).toLowerCase();
}

export async function FileRenderer({
  path,
  content,
  raw,
  inlineEditable = false,
  parentBlobSha = null,
  htmlMeta,
}: FileRendererProps) {
  const ext = getExt(path);

  if (raw) {
    return <SourceBlock content={content} />;
  }

  // Markdown — use the same renderMarkdown as publish flow.
  // assetBase routes `/__assets__/...` references through the authenticated
  // workspace asset proxy at /workspace/a/<path> so images, fonts, etc.
  // resolve via the user's session.
  if (ext === "md" || ext === "mdx") {
    const html = await renderMarkdown(content, {
      assetBase: "/workspace",
      withSourcePos: inlineEditable,
    });
    const rendered = (
      <article
        className="prose prose-sm sm:prose-base max-w-none break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
    return wrapEditable({
      enabled: inlineEditable,
      path,
      content,
      parentBlobSha,
      kind: "md-block",
      children: rendered,
    });
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
    // SSR fetcher for inlined+scoped stylesheets. Only resolves /__assets__/*;
    // pulls bytes via the same authenticated /me/asset endpoint that backs the
    // browser-facing /workspace/a proxy, using the user's huozi-cloud-key.
    // Returns null on auth miss / non-CSS / fetch error so the link silently
    // disappears instead of leaking through to the host shell.
    const cookieStore = await cookies();
    const sessionKey = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
    const fetchAsset = async (url: string): Promise<string | null> => {
      if (!sessionKey || !url.startsWith("/__assets__/")) return null;
      const upstream = "/me/asset" + url;
      try {
        const res = await cloudFetch(upstream, {
          headers: { Authorization: `Bearer ${sessionKey}` },
        });
        if (!res.ok) return null;
        const ct = res.headers.get("Content-Type") ?? "";
        if (!ct.toLowerCase().startsWith("text/css")) return null;
        return await res.text();
      } catch {
        return null;
      }
    };

    // bundleCtx threads the workspace-side data proxy base into the `data`
    // bundle's init shim. The full host FILE path is encoded into the URL
    // (not just its directory) so the proxy can re-parse the host HTML's
    // `<meta huozi:share-include>` and enforce the same allowlist the
    // worker enforces on publish — catching missing declarations during
    // workspace preview instead of after a share has gone out.
    const dataBase = `/workspace/d/${encodeURIComponent(path)}/`;
    const { html } = await processHtmlDirect(processChartComponents(content), {
      scopeTo: ".huozi-html-host",
      // Route `<link href="/__assets__/...">`, `<img src="/__assets__/...">`,
      // etc. through the authenticated workspace asset proxy. Mirrors the
      // share path's `assetBase: "/p/<slug>"` — same rewrite, different
      // auth model. See `/workspace/a/[...path]/route.ts`.
      assetBase: "/workspace",
      fetchAsset,
      injectSourcePos: inlineEditable,
      bundleCtx: { dataBase, filePath: path },
    });
    // Re-use caller-computed extracts when available; otherwise scan
    // here. Workspace view passes htmlMeta; legacy direct callers don't.
    const meta = htmlMeta ?? computeHtmlMeta(content);
    const { format, pages, tabs, refreshMs } = meta;
    const pageUnit: "slide" | "page" =
      format === "deck" || format === "story" ? "slide" : "page";

    // Canvas dispatch is fully owned by HtmlCanvasFrame — the same
    // component that share-viewer (the public /p/<slug> page) uses, so
    // the visible output is byte-identical across workspace inline,
    // workspace fullscreen, and the publish surface. Any future change
    // to canvas / scale / background / fit logic lives in exactly one
    // file.
    const canvas = resolveCanvas(content, format);
    const frame = (
      <HtmlCanvasFrame
        html={html}
        format={format}
        canvas={canvas}
        pages={pages}
        pageUnit={pageUnit}
        tabs={tabs}
        refreshMs={refreshMs}
      />
    );
    // Validation banner is workspace-only (the publish surface intentionally
    // hides dev hints from readers). `inlineEditable` doubles as the
    // workspace-context flag — `/p/<slug>` always passes false.
    const validationIssues = inlineEditable ? validateHuoziHtml(content) : [];
    const editable = wrapEditable({
      enabled: inlineEditable,
      path,
      content,
      parentBlobSha,
      kind: "html-element",
      children: frame,
    });
    return (
      <>
        {validationIssues.length > 0 && (
          <HtmlValidationBanner issues={validationIssues} filePath={path} />
        )}
        {editable}
      </>
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
    const grid = (
      <CsvGrid content={content} delim={ext === "tsv" ? "\t" : ","} />
    );
    return wrapEditable({
      enabled: inlineEditable,
      path,
      content,
      parentBlobSha,
      kind: "csv-cell",
      children: grid,
    });
  }

  // JSONL — Collection: cards / stream / table / timeline. See
  // app/docs/four-types.md for the framing and src/lib/jsonl/ for the
  // parser + fold algorithm.
  if (ext === "jsonl") {
    const view = <CollectionView content={content} />;
    return wrapEditable({
      enabled: inlineEditable,
      path,
      content,
      parentBlobSha,
      kind: "jsonl-field",
      children: view,
    });
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

interface WrapEditableArgs {
  enabled: boolean;
  path: string;
  content: string;
  parentBlobSha: string | null;
  kind: ObjectKind;
  children: React.ReactNode;
}

/**
 * Wrap a renderer's output in an EditableSurface when the caller asked
 * for inline editing. The content string is inlined into a `data-source`
 * attribute on the surface so the client can byte-slice into it without
 * a separate fetch — small files only, but the workspace inline reader
 * is already capped at the same 10 MB inline limit so this is no extra
 * cost.
 *
 * When disabled (e.g. public /p/<slug>), returns the raw children with
 * no wrapper.
 */
function wrapEditable({
  enabled,
  path,
  content,
  parentBlobSha,
  kind,
  children,
}: WrapEditableArgs): React.ReactElement {
  if (!enabled) return <>{children}</>;
  // jsonl (Collection) uses an email-style 3-pane that needs vertical
  // fill all the way down. Pass the flex chain through the editable
  // surface's wrapper so the inner panes stretch to viewport height.
  const wrapperClassName =
    kind === "jsonl-field"
      ? "relative flex flex-col flex-1 min-h-0"
      : "relative";
  // Highlights are gated on the same `enabled` flag as inline-edit —
  // they share the workspace/`canEdit` surface and don't render on
  // public `/p/<slug>` viewers. Only the byte-range + jsonl-field kinds
  // have a working capture path today; csv-cell skips the layer to
  // avoid mounting code that can't do anything useful.
  const highlightsKinds: ObjectKind[] = [
    "md-block",
    "html-element",
    "jsonl-field",
  ];
  const showHighlights = highlightsKinds.includes(kind);
  return (
    <EditableSurface
      filePath={path}
      fileKind={kind}
      sourceContent={content}
      parentBlobSha={parentBlobSha}
      wrapperClassName={wrapperClassName}
    >
      {children}
      {showHighlights && (
        <>
          <HighlightLayer sourcePath={path} />
          <HighlightsDrawer sourcePath={path} />
        </>
      )}
    </EditableSurface>
  );
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

