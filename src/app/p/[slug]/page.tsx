import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/drive/shares";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { extractPages, type PageEntry } from "@/lib/html/extract-pages";
import { detectHuoziFormat, type HuoziFormat } from "@/lib/html/detect-format";
import { ShareViewer } from "@/components/p/share-viewer";

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
  const base = res.data.file_path.split("/").pop() ?? res.data.file_path;
  return {
    title: `${base} — huozi`,
    description: "A shared file on huozi.app.",
    robots: { index: false, follow: false },
  };
}

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

async function renderForPath(
  filePath: string,
  text: string,
): Promise<string | null> {
  const e = ext(filePath);
  if (e === "md" || e === "mdx") {
    return await renderMarkdown(text);
  }
  if (e === "html" || e === "htm") {
    const { html } = processHtmlDirect(processChartComponents(text));
    return html;
  }
  // CSV / TSV: null → ShareViewer mounts the interactive client table.
  if (e === "csv" || e === "tsv") {
    return null;
  }
  // JSON / TXT / other: wrap in a preformatted block with minimal escaping.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="font-mono text-xs whitespace-pre-wrap break-words">${escaped}</pre>`;
}

export default async function SharedPage({ params }: { params: Params }) {
  const { slug } = await params;
  const res = await getShare(slug);

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
  const locked = share.locked === true;

  let prerenderedHtml: string | undefined;
  let rawText: string | undefined;
  let pages: PageEntry[] = [];
  let pageUnit: "page" | "slide" | "sheet" = "page";
  let htmlFormat: HuoziFormat = "web";
  if (!locked) {
    // share.text is the raw file content
    rawText = share.text;
    if (rawText) {
      const rendered = await renderForPath(share.file_path, rawText);
      if (rendered !== null) prerenderedHtml = rendered;
      const e = ext(share.file_path);
      if (e === "html" || e === "htm") {
        pages = extractPages(rawText);
        htmlFormat = detectHuoziFormat(rawText);
        pageUnit =
          htmlFormat === "deck" || htmlFormat === "story" ? "slide" : "page";
      }
    }
  }

  // Publish surface is full-bleed: the file IS the page. ShareViewer renders
  // in alwaysOpen fullscreen mode, with an "Open in Huozi" link top-right.
  // No header / footer chrome here so the content shows exactly as it does
  // in the workspace view's fullscreen mode.
  return (
    <ShareViewer
      slug={slug}
      filePath={share.file_path}
      locked={locked}
      prerenderedHtml={prerenderedHtml}
      rawText={rawText}
      pages={pages}
      pageUnit={pageUnit}
      htmlFormat={htmlFormat}
    />
  );
}
