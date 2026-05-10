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

const OPEN_TAG_RE =
  /<(section|article)\b([^>]*\bdata-page\b[^>]*)>/gi;

/**
 * Inject `id="s${N}"` onto every `<section data-page>` / `<article data-page>`
 * that doesn't already declare one. Idempotent: sections with an explicit id
 * are left alone. Comments are skipped so example markup inside `<!-- ... -->`
 * doesn't get counted.
 *
 * Why this exists: pre-2026-05-10, pagers and outline menus synthesized
 * `s${N}` ids in memory but never wrote them back to the rendered HTML.
 * `scrollIntoView(getElementById("s3"))` then no-op'd because the DOM had no
 * such id, breaking keyboard / button navigation. This pass guarantees DOM
 * matches what extractPages reports — the two are computed from the same
 * traversal order so their `s${N}` numbering always agrees.
 *
 * Intended call site: `processHtmlDirect` for HTML rendered server-side.
 * Idempotent so calling it twice is safe (the second pass finds existing
 * ids and bails on each section).
 */
export function ensurePageIds(html: string): string {
  // Comment ranges are skipped during numbering AND during injection so
  // example markup like `<!-- <section data-page>...</section> -->` doesn't
  // shift live section indices.
  const commentRanges: Array<[number, number]> = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let cm: RegExpExecArray | null;
  while ((cm = commentRe.exec(html)) !== null) {
    commentRanges.push([cm.index, cm.index + cm[0].length]);
  }
  const inComment = (pos: number): boolean => {
    for (const [s, e] of commentRanges) {
      if (pos >= s && pos < e) return true;
    }
    return false;
  };

  let result = "";
  let lastIndex = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  // Re-create regex per call so the lastIndex state is fresh.
  const re = new RegExp(OPEN_TAG_RE.source, OPEN_TAG_RE.flags);
  while ((m = re.exec(html)) !== null) {
    if (inComment(m.index)) continue;
    i += 1;
    const tag = m[1];
    const attrs = m[2];
    result += html.slice(lastIndex, m.index);
    const hasId = /\bid\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(attrs);
    if (hasId) {
      result += m[0];
    } else {
      // Inject `id="s${i}"` immediately after the tag name. Preserves any
      // following attributes verbatim including their leading whitespace.
      result += `<${tag} id="s${i}"${attrs}>`;
    }
    lastIndex = m.index + m[0].length;
  }
  result += html.slice(lastIndex);
  return result;
}
