import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/drive/shares";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
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
  if (!locked) {
    // share.text is the raw file content
    rawText = share.text;
    if (rawText) {
      const rendered = await renderForPath(share.file_path, rawText);
      if (rendered !== null) prerenderedHtml = rendered;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-12 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-baseline gap-2 text-sm font-medium tracking-wide"
          >
            <span className="font-serif text-lg font-bold text-accent leading-none">
              字
            </span>
            huozi.app
          </Link>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            shared · read-only
          </span>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
          <ShareViewer
            slug={slug}
            filePath={share.file_path}
            locked={locked}
            prerenderedHtml={prerenderedHtml}
            rawText={rawText}
            mimeType={(share as { mime_type?: string }).mime_type}
          />
        </div>
      </main>
      <footer className="border-t border-border/50 py-4">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>Snapshot published by the owner. Live file may have changed since.</span>
          <Link href="/cloud" className="underline hover:text-foreground">
            What is huozi?
          </Link>
        </div>
      </footer>
    </div>
  );
}
