/**
 * Extract page outline from a published HTML document.
 *
 * Scans for `<section data-page id="…" data-title="…">` (or `<article …>`)
 * tags. The `data-page` attribute is the marker — its value is ignored.
 *
 *   id          → anchor target (#sN)
 *   data-title  → menu label (falls back to inner <h1>/<h2>, then "Page N")
 *
 * Pure regex; no DOM library needed.
 */

export interface PageEntry {
  id: string;
  title: string;
  index: number;
}

const TAG_RE =
  /<(?:section|article)\b([^>]*\bdata-page\b[^>]*)>([\s\S]*?)<\/(?:section|article)>/gi;

function readAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return m ? (m[1] ?? m[2]) : undefined;
}

function firstHeading(inner: string): string | undefined {
  const m = inner.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
  if (!m) return undefined;
  const text = m[1].replace(/<[^>]+>/g, "").trim();
  return text || undefined;
}

export function extractPages(html: string): PageEntry[] {
  // Strip HTML comments first so example <section data-page> markup inside
  // template comments doesn't get counted as a real page.
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const out: PageEntry[] = [];
  let i = 0;
  for (const m of stripped.matchAll(TAG_RE)) {
    i += 1;
    const id = readAttr(m[1], "id") ?? `s${i}`;
    const title =
      readAttr(m[1], "data-title") ?? firstHeading(m[2]) ?? `Page ${i}`;
    out.push({ id, title, index: i });
  }
  return out;
}
