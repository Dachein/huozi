import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare, unlockShare } from "@/lib/drive/shares";
import { cloudFetch } from "@/lib/cloud-fetch";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { type PageEntry } from "@/lib/html/extract-pages";
import { type TabEntry } from "@/lib/html/extract-tabs";
import { type HuoziFormat } from "@/lib/html/detect-format";
import { computeHtmlMeta } from "@/lib/html/meta";
import { extractShareMeta } from "@/lib/share-meta";
import { parseMarkdown } from "@/lib/share-meta/extract-markdown";
import { ShareViewer } from "@/components/p/share-viewer";
import { memoize, cacheProbe } from "@/lib/memo-cache";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const res = await getShare(slug);
  if (!res.ok) {
    return { title: "Not found — huozi" };
  }
  const share = res.data;
  const text = share.locked === true ? undefined : share.text;
  const meta = extractShareMeta(share.file_path, text);
  const url = `/p/${slug}`;

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    authors: meta.authors?.map((name) => ({ name })),
    alternates: { canonical: url },
    openGraph: {
      type: meta.type,
      title: meta.title,
      description: meta.description,
      url,
      siteName: "活字 Huozi",
      locale: meta.locale,
      images: [{ url: meta.image }],
    },
    twitter: {
      card: meta.twitterCard,
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
    // Locked shares stay out of indexes; everything else can be indexed iff the
    // author hasn't otherwise opted out via a robots <meta> in the file.
    robots:
      share.locked === true
        ? { index: false, follow: false }
        : { index: true, follow: true },
  };
}

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

async function renderForPath(
  filePath: string,
  text: string,
  slug: string,
): Promise<string | null> {
  const e = ext(filePath);
  if (e === "md" || e === "mdx") {
    // Strip YAML frontmatter before passing to remark — generateMetadata read
    // the same frontmatter upstream, so we're not losing information.
    const { content } = parseMarkdown(text);
    // assetBase scopes /__assets__/... URLs back through this share —
    // the route handler at /p/[slug]/__assets__/[...path] proxies to
    // the share's workspace.
    return await renderMarkdown(content, { assetBase: `/p/${slug}` });
  }
  if (e === "html" || e === "htm") {
    // SSR-inline workspace stylesheets via the share-asset proxy so the
    // bytes go through the same sanitize/bundle pipeline as inline styles.
    // The author document later runs inside HtmlIframeFrame, so body/root
    // selectors apply to the iframe document rather than the share shell.
    const fetchAsset = async (url: string): Promise<string | null> => {
      if (!url.startsWith("/__assets__/")) return null;
      try {
        const upstream = `/shares/${slug}/asset${url}`;
        const res = await cloudFetch(upstream);
        if (!res.ok) return null;
        const ct = res.headers.get("Content-Type") ?? "";
        if (!ct.toLowerCase().startsWith("text/css")) return null;
        return await res.text();
      } catch {
        return null;
      }
    };
    const { html } = await processHtmlDirect(processChartComponents(text), {
      assetBase: `/p/${slug}`,
      fetchAsset,
      // `bundle=data` reads dataBase to construct proxy URLs. The worker
      // at `/shares/<slug>/data/<sibling>` resolves siblings relative to
      // the share's host file — so the base URL only needs the slug.
      bundleCtx: { dataBase: `/p/${slug}/d/`, filePath },
    });
    return html;
  }
  // CSV / TSV / JSONL: null → ShareViewer mounts the matching interactive
  // client viewer (CsvGrid for csv/tsv, CollectionView for jsonl). Server-
  // side prerender doesn't help here — these viewers run in the browser.
  if (e === "csv" || e === "tsv" || e === "jsonl") {
    return null;
  }
  // JSON / TXT / other: wrap in a preformatted block with minimal escaping.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="font-mono text-xs whitespace-pre-wrap break-words">${escaped}</pre>`;
}

interface RenderedShare {
  filePath: string;
  prerenderedHtml: string | undefined;
  rawText: string | undefined;
  pages: PageEntry[];
  pageUnit: "page" | "slide" | "sheet";
  htmlFormat: HuoziFormat;
  tabs: TabEntry[];
  refreshMs: number | null;
}

/**
 * Memoized share render. Caches everything an unlocked share needs to
 * paint — including the full prerendered HTML string — so repeat opens
 * skip the worker fetch, HTML sanitize, scope rewrite, and all metadata
 * scans. 60s TTL is short enough that author edits show up promptly.
 *
 * Locked shares are NEVER cached: each visitor must pass through the
 * password gate; mixing their personalized response with another
 * visitor's would be a security bug. The caller checks `locked` before
 * deciding to read from cache.
 */
async function loadRenderedShare(
  slug: string,
  share: { file_path: string; text?: string | null | undefined },
): Promise<RenderedShare> {
  const filePath = share.file_path;
  const rawText = share.text ?? undefined;
  let prerenderedHtml: string | undefined;
  let pages: PageEntry[] = [];
  let pageUnit: "page" | "slide" | "sheet" = "page";
  let htmlFormat: HuoziFormat = "blog";
  let tabs: TabEntry[] = [];
  let refreshMs: number | null = null;
  if (rawText) {
    const rendered = await renderForPath(filePath, rawText, slug);
    if (rendered !== null) prerenderedHtml = rendered;
    const e = ext(filePath);
    if (e === "html" || e === "htm") {
      const meta = computeHtmlMeta(rawText);
      htmlFormat = meta.format;
      pages = meta.pages;
      tabs = meta.tabs;
      refreshMs = meta.refreshMs;
      pageUnit =
        htmlFormat === "deck" || htmlFormat === "story" ? "slide" : "page";
    }
  }
  return {
    filePath,
    prerenderedHtml,
    rawText,
    pages,
    pageUnit,
    htmlFormat,
    tabs,
    refreshMs,
  };
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SharedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // `?pw=` lets a caller (today: the miniapp, after collecting the code once
  // natively) unlock server-side; `?chrome=0` (alias `?embed=1`) hides the
  // "Open in Huozi" link for embedded web-views.
  const pw = firstParam(sp.pw);
  const chromeless = firstParam(sp.chrome) === "0" || firstParam(sp.embed) === "1";
  // getShare is a worker round-trip into huozi-cloud — empirically 800-
  // 2400ms per call. Memoize so steady-state opens skip it entirely.
  // TTL is short (30s) because share metadata (locked toggle, file_path
  // edits) can change underneath us.
  const shareMetaKey = `share-meta:${slug}`;
  const res = await memoize(shareMetaKey, 30_000, () => getShare(slug));

  if (!res.ok) {
    if (res.errorCode === 404) notFound();
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-sm">
        <h1 className="text-xl font-semibold mb-2">Couldn&rsquo;t load share</h1>
        <p className="text-muted-foreground">{res.message}</p>
        <Link
          href="/"
          className="mt-6 inline-block underline text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to huozi
        </Link>
      </div>
    );
  }

  const share = res.data;
  let locked = share.locked === true;

  // Server-side passcode unlock. Doing it here — not client-side via
  // PasscodeForm — is what lets a locked HTML share run the full SSR
  // sanitize/chart pipeline; the client unlock path can only show raw
  // source. Wrong / absent code stays locked and falls through to the
  // form. The fetched text drives loadRenderedShare exactly like an
  // unlocked share would.
  let shareForRender: { file_path: string; text?: string | null | undefined } =
    share;
  let pwUnlocked = false;
  if (locked && pw && /^\d{6}$/.test(pw)) {
    const u = await unlockShare(slug, pw);
    if (u.ok) {
      shareForRender = { file_path: u.data.file_path, text: u.data.text };
      locked = false;
      pwUnlocked = true;
    }
  }

  // Cache only the anonymous public render. Locked AND pw-unlocked renders
  // take the cold path so we never serve one visitor's gated content to
  // another (the cache key is slug-only, with no passcode in it).
  const cacheKey = `share-render:${slug}`;
  const cacheBefore = cacheProbe(cacheKey);
  const rendered =
    locked || pwUnlocked
      ? await loadRenderedShare(slug, shareForRender)
      : await memoize(cacheKey, 60_000, () => loadRenderedShare(slug, share));
  const cacheHit = cacheBefore && !locked && !pwUnlocked;

  // Publish surface is full-bleed: the file IS the page. ShareViewer renders
  // in alwaysOpen fullscreen mode, with an "Open in Huozi" link top-right.
  // No header / footer chrome here so the content shows exactly as it does
  // in the workspace view's fullscreen mode.
  return (
    <>
      {/* Server-timing breadcrumb (instrumentation; safe to leave in
          production — invisible in normal rendering, useful for perf
          regression triage). */}
      <meta
        name="huozi-server-timing"
        content={`cache=${cacheHit ? "hit" : "miss"}`}
      />
      <ShareViewer
        slug={slug}
        filePath={rendered.filePath}
        locked={locked}
        chromeless={chromeless}
        prerenderedHtml={rendered.prerenderedHtml}
        rawText={rendered.rawText}
        pages={rendered.pages}
        pageUnit={rendered.pageUnit}
        htmlFormat={rendered.htmlFormat}
        tabs={rendered.tabs}
        refreshMs={rendered.refreshMs}
      />
    </>
  );
}
