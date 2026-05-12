/**
 * Extract dashboard tab manifest from `<meta name="huozi:tabs">`.
 *
 * Syntax (one meta, comma-separated, whitespace tolerated):
 *
 *   <meta name="huozi:tabs" content="overview=概览, kanban=任务流, modules=模块">
 *
 *   id        — DOM key. Matches `<section data-tab="<id>">` in body.
 *               Used for URL hash (`#kanban`) and event payload.
 *   = label   — optional. Default is the id itself.
 *
 * Distinct from `<section data-page>` (extract-pages.ts): pages are an
 * ordered sequence with prev/next nav; tabs are a named, mutually-exclusive
 * set with platform-managed chrome. Two contracts, two parsers.
 *
 * Comments / pre / code / style / script regions are skipped so example
 * markup inside spec docs doesn't false-positive.
 */

export interface TabEntry {
  id: string;
  label: string;
}

const META_RE =
  /<meta\s+[^>]*?\bname\s*=\s*["']huozi:tabs["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']/i;

function buildSkipRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const sources: RegExp[] = [
    /<!--[\s\S]*?-->/g,
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
  ];
  for (const src of sources) {
    const r = new RegExp(src.source, src.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(html)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
  }
  return false;
}

/** Parse the manifest meta. Returns `[]` if absent / empty / inside a code
 *  block. Author-declared order is preserved. */
export function extractTabs(html: string): TabEntry[] {
  // Search globally so we can skip code-block hits; the first non-inert
  // match wins.
  const skip = buildSkipRanges(html);
  const globalRe = new RegExp(META_RE.source, "gi");
  let m: RegExpExecArray | null;
  let content: string | null = null;
  while ((m = globalRe.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue;
    content = m[1] ?? null;
    break;
  }
  if (!content) return [];

  const out: TabEntry[] = [];
  const seen = new Set<string>();
  for (const part of content.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const eq = entry.indexOf("=");
    const id = (eq < 0 ? entry : entry.slice(0, eq)).trim();
    const label = (eq < 0 ? entry : entry.slice(eq + 1)).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: label || id });
  }
  return out;
}

/**
 * Parse `<meta name="huozi:refresh" content="30s">` into milliseconds.
 *
 * Accepted suffixes: `s` (seconds), `m` (minutes). Bare number = seconds.
 * Returns `null` when absent, malformed, or non-positive — caller treats
 * that as "no auto-refresh".
 */
export function extractRefreshMs(html: string): number | null {
  const re =
    /<meta\s+[^>]*?\bname\s*=\s*["']huozi:refresh["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']/i;
  const m = html.match(re);
  if (!m) return null;
  const v = m[1]!.trim().toLowerCase();
  const numMatch = v.match(/^(\d+(?:\.\d+)?)(s|m)?$/);
  if (!numMatch) return null;
  const n = parseFloat(numMatch[1]!);
  if (!isFinite(n) || n <= 0) return null;
  const unit = numMatch[2] ?? "s";
  const ms = unit === "m" ? n * 60_000 : n * 1000;
  return Math.round(ms);
}
