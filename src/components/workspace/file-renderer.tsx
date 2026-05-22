import { cookies } from "next/headers";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { detectHuoziFormat } from "@/lib/html/detect-format";
import { extractPages } from "@/lib/html/extract-pages";
import { extractTabs, extractRefreshMs } from "@/lib/html/extract-tabs";
import { validateHuoziHtml } from "@/lib/html/validate";
import { cloudFetch } from "@/lib/cloud-fetch";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { CsvGrid } from "@/components/csv-grid";
import { CollectionView } from "@/components/collection-view";
import { EditableSurface } from "@/components/workspace/inline-edit";
import type { ObjectKind } from "@/components/workspace/inline-edit";
import { HtmlInlineFrame } from "@/components/workspace/html-inline-frame";
import { DashboardSurface } from "@/components/workspace/dashboard-surface";
import { HtmlValidationBanner } from "@/components/workspace/html-validation-banner";
import { ScaledStage } from "@/components/workspace/scaled-stage";
import { FixedWidthStage } from "@/components/workspace/fixed-width-stage";
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
    const format = detectHuoziFormat(content);
    const pages = extractPages(content);
    const tabs = format === "dashboard" ? extractTabs(content) : [];
    const refreshMs = format === "dashboard" ? extractRefreshMs(content) : null;
    const pageUnit: "slide" | "page" =
      format === "deck" || format === "story" ? "slide" : "page";

    // Canvas dispatch — see lib/html/canvas.ts.
    //
    //   - scale mode (story / deck / dashboard): fixed W×H, ScaledStage
    //     uses transform: scale to fit the surrounding box. cqw/cqh
    //     inside resolves to canvas dims.
    //   - lock-width mode (paper): fixed W, content-driven H,
    //     FixedWidthStage centers a column with vertical scroll.
    //   - null (mobile / web / unknown): fall through to legacy
    //     pickHtmlLayout — these formats reflow freely, no canvas.
    const canvas = resolveCanvas(content, format);
    const frame = (() => {
      // Inner host: in canvas modes the outer Stage already controls
      // sizing, so the host fills 100% of the Stage; in legacy mode
      // the host carries pickHtmlLayout's class+style directly.
      if (canvas) {
        const stretchCls =
          "!w-full !h-full [&_.huozi-story]:!w-full [&_.huozi-story]:!h-full [&_.huozi-story]:!min-h-0 [&_.huozi-deck]:!w-full [&_.huozi-deck]:!h-full [&_.huozi-deck]:!min-h-0";
        const stretchStyle = { width: "100%", height: "100%" } as const;
        const inner =
          format === "dashboard" ? (
            <DashboardSurface
              html={html}
              hostClassName={stretchCls}
              hostStyle={stretchStyle}
              tabs={tabs}
              refreshMs={refreshMs}
            />
          ) : (
            <HtmlInlineFrame
              html={html}
              hostClassName={
                canvas.mode === "lock-width"
                  ? // paper flows vertically; only width is locked.
                    // Don't force h-full on the host — let height grow.
                    "!w-full [&_.huozi-paper]:!min-h-0"
                  : stretchCls
              }
              hostStyle={
                canvas.mode === "lock-width"
                  ? { width: "100%" }
                  : stretchStyle
              }
              format={format}
              pages={pages}
              pageUnit={pageUnit}
            />
          );
        if (canvas.mode === "scale") {
          return (
            <div
              className="huozi-canvas-outer"
              style={{
                width: "100%",
                aspectRatio: `${canvas.width} / ${canvas.height}`,
                maxWidth: `${canvas.width}px`,
                marginLeft: "auto",
                marginRight: "auto",
                background: canvas.background,
              }}
            >
              <ScaledStage
                width={canvas.width}
                height={canvas.height!}
                fit={canvas.fit}
              >
                {inner}
              </ScaledStage>
            </div>
          );
        }
        // lock-width (paper)
        return (
          <div
            className="huozi-canvas-outer"
            style={{
              width: "100%",
              height: "min(80vh, 1100px)",
              maxWidth: `${canvas.width}px`,
              marginLeft: "auto",
              marginRight: "auto",
              background: canvas.background,
            }}
          >
            <FixedWidthStage width={canvas.width}>{inner}</FixedWidthStage>
          </div>
        );
      }
      // No canvas — mobile / web / unknown fall back to the legacy
      // flow-based sizing.
      const layout = pickHtmlLayout(content);
      return (
        <HtmlInlineFrame
          html={html}
          hostClassName={layout.className}
          hostStyle={layout.style}
          format={format}
          pages={pages}
          pageUnit={pageUnit}
        />
      );
    })();
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
  return (
    <EditableSurface
      filePath={path}
      fileKind={kind}
      sourceContent={content}
      parentBlobSha={parentBlobSha}
      wrapperClassName={wrapperClassName}
    >
      {children}
    </EditableSurface>
  );
}

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
  } else if (format === "dashboard") {
    // Big-screen, fixed-aspect surface. Default 16:9 (overridable via
    // `<meta huozi:viewport>` — the meta check above already set
    // style.aspectRatio when present). Author owns inner layout; we just
    // provide the box. No max-height: the dashboard fills its aspect-
    // constrained box and any tab section longer than the box scrolls
    // internally via the platform CSS rule on [data-tab].
    if (!meta?.["aspect-ratio"]) style.aspectRatio = "16 / 9";
  } else if (format === "blog") {
    // Long-flow responsive content: let the page extend naturally.
    // Workspace's main column already scrolls, so wrapping in a
    // fixed-height scroll box just makes a window-in-a-window. Only the
    // paginated formats (deck / story / paper) need a constraint to
    // keep one "page" visible at a time.
    cls = "[&_.huozi-blog]:!min-h-0";
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

