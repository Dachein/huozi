/**
 * `/o/<token>` — short-lived single-file render surface.
 *
 * Sister of `/p/<slug>` but for **private** preview: the URL is signed
 * (HS256 over HUOZI_AUTH_SECRET, `iss: huozi-open`), expires in ≤ 1h,
 * and is not indexed / not listed / not part of a share KV record.
 * Mints come from the `huozi_open` MCP tool — the miniapp's web-view is
 * the first consumer, but iframe embeds / future mobile viewers can
 * reuse this surface unchanged.
 *
 * Pipeline reuse:
 *   - Fetches bytes via `getOpen()` from the worker `/o/<token>` route.
 *   - Runs the **same** `processChartComponents` + `processHtmlDirect` +
 *     `computeHtmlMeta` chain as `/p/<slug>` so HTML, deck, story,
 *     paper, dashboard, blog all render byte-identically across publish
 *     and private-preview surfaces.
 *   - Wraps in `FullscreenContent alwaysOpen` — same fullscreen mode the
 *     workspace and share viewers use, so author CSS lays out against
 *     the canvas it expects.
 *   - Sibling data: passes `bundleCtx.dataBase = /o/<token>/d/` so
 *     data-driven dashboards resolve their `huozi:share-include` jsonl/
 *     csv siblings through the `/o/<token>/d/<path>` proxy — the same
 *     allowlist + live-data contract as `/p/<slug>/d/`.
 *
 * Differences from `/p/<slug>`:
 *   - NO "Open in Huozi" chrome link (web-view can't navigate to
 *     huozi.app cleanly — it would break out of the miniapp shell).
 *   - NO OG / Twitter card metadata (this is a private viewer page,
 *     not a sharing surface).
 *   - `robots: noindex, nofollow` — token URLs must not be crawled.
 *   - NO asset proxy yet — HTML pages that reference
 *     `/__assets__/foo.png` will have broken images for now. Add an
 *     `/o/<token>/__assets__/<path>` route if asset-rich pages become
 *     a common miniapp case. (The *data* proxy at `/o/<token>/d/<path>`
 *     IS wired — see Pipeline reuse above.)
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { computeHtmlMeta } from "@/lib/html/meta";
import { parseMarkdown } from "@/lib/share-meta/extract-markdown";
import { getOpen } from "@/lib/drive/open-client";
import {
  FullscreenContent,
  type FullscreenMode,
} from "@/components/workspace/fullscreen-content";
import { FullscreenProvider } from "@/components/workspace/fullscreen-context";
import { HtmlCanvasFrame } from "@/components/workspace/html-canvas-frame";
import { CsvGrid } from "@/components/csv-grid";
import { CollectionView } from "@/components/collection-view";
import { resolveCanvas } from "@/lib/html/canvas";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "Preview — huozi",
  // Open tokens are short-lived single-file grants — never indexed.
  robots: { index: false, follow: false },
};

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

function fullscreenModeFor(filePath: string): FullscreenMode {
  const e = ext(filePath);
  if (e === "html" || e === "htm") return "raw";
  if (e === "csv" || e === "tsv" || e === "jsonl") return "grid";
  return "reader";
}

interface Prepared {
  filePath: string;
  rawText: string | undefined;
  prerenderedHtml: string | undefined;
  isHtml: boolean;
  isMarkdown: boolean;
}

async function prepareRender(
  filePath: string,
  text: string | undefined,
  token: string,
): Promise<Prepared> {
  const e = ext(filePath);
  if (!text) {
    return { filePath, rawText: undefined, prerenderedHtml: undefined, isHtml: false, isMarkdown: false };
  }
  if (e === "md" || e === "mdx") {
    const { content } = parseMarkdown(text);
    // assetBase intentionally empty — see header docstring on asset proxy.
    const html = await renderMarkdown(content, { assetBase: "" });
    return { filePath, rawText: text, prerenderedHtml: html, isHtml: false, isMarkdown: true };
  }
  if (e === "html" || e === "htm") {
    const { html } = await processHtmlDirect(processChartComponents(text), {
      assetBase: "",
      // No fetchAsset — the `/__assets__/` proxy isn't wired on /o yet,
      // so asset-rich HTML degrades to "missing images" (see header).
      hostAsBody: ".huozi-html-host",
      // bundleCtx DOES resolve here: the worker serves `huozi:share-include`
      // siblings at /o/<token>/data/<path>, proxied by the route handler at
      // /o/[token]/d/[...path]. dataBase embeds that base into
      // `window.huozi.data`, so `window.huozi.read()` and manual
      // `fetch(location.pathname + '/d/' + name)` both reach the data —
      // byte-identical to the /p/<slug> publish surface.
      bundleCtx: { dataBase: `/o/${token}/d/`, filePath },
    });
    return { filePath, rawText: text, prerenderedHtml: html, isHtml: true, isMarkdown: false };
  }
  return { filePath, rawText: text, prerenderedHtml: undefined, isHtml: false, isMarkdown: false };
}

export default async function OpenPage({ params }: { params: Params }) {
  const { token } = await params;
  const res = await getOpen(token);
  if (!res.ok) {
    if (res.errorCode === 404 || res.errorCode === 410) notFound();
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-sm">
        <h1 className="text-xl font-semibold mb-2">无法加载</h1>
        <p className="text-muted-foreground">{res.message}</p>
      </div>
    );
  }

  const content = res.data;
  const filePath = content.file_path;
  const text = content.text;
  const e = ext(filePath);

  const prepared = await prepareRender(filePath, text, token);

  const meta = prepared.isHtml && text ? computeHtmlMeta(text) : null;
  const htmlFormat = meta?.format ?? "blog";
  const canvas =
    prepared.isHtml && text ? resolveCanvas(text, htmlFormat) : null;
  const pageUnit: "page" | "slide" | "sheet" =
    htmlFormat === "deck" || htmlFormat === "story" ? "slide" : "page";

  return (
    <FullscreenProvider initial>
      <FullscreenContent
        mode={fullscreenModeFor(filePath)}
        pages={meta?.pages ?? []}
        pageUnit={pageUnit}
        htmlFormat={htmlFormat}
        alwaysOpen
        // No `chrome` — open-token pages have no "Open in Huozi"
        // button. The host (miniapp) provides its own back button.
      >
        {prepared.isHtml && prepared.prerenderedHtml ? (
          <HtmlCanvasFrame
            html={prepared.prerenderedHtml}
            format={htmlFormat}
            canvas={canvas}
            pages={meta?.pages ?? []}
            pageUnit={pageUnit}
            tabs={meta?.tabs ?? []}
            refreshMs={meta?.refreshMs ?? null}
          />
        ) : prepared.isMarkdown && prepared.prerenderedHtml ? (
          <article
            className="prose prose-sm sm:prose-base max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: prepared.prerenderedHtml }}
          />
        ) : e === "csv" || e === "tsv" ? (
          text ? (
            <CsvGrid content={text} delim={e === "tsv" ? "\t" : ","} />
          ) : (
            <EmptyHint />
          )
        ) : e === "jsonl" ? (
          text ? <CollectionView content={text} /> : <EmptyHint />
        ) : text ? (
          <pre className="rounded-lg border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
            {text}
          </pre>
        ) : (
          <EmptyHint />
        )}
      </FullscreenContent>
    </FullscreenProvider>
  );
}

function EmptyHint() {
  return (
    <div className="text-sm text-muted-foreground italic">(no content)</div>
  );
}
