/**
 * Detect which of the 5 huozi standard layouts a given HTML file uses.
 *
 * Resolution order:
 *   1. <meta name="huozi:format" content="..."> in <head>. Authoritative when
 *      present; agents should always set this when writing huozi-templated HTML.
 *   2. Class sniff on the body root (.huozi-{deck,story,paper,mobile,web}).
 *      Pre-meta legacy files lean on this.
 *   3. Default: "web" — the catch-all for unmarked HTML. "web" used to be
 *      called "page"; the rename happened when the format taxonomy split
 *      into 2 unpaginated (web / mobile) + 3 paginated (deck / story / paper).
 *      Custom HTML without any opt-in marker is treated as web: long-flow,
 *      no pager, no auto-rotate — renders like a regular web page.
 */

export type HuoziFormat =
  | "web"
  | "mobile"
  | "deck"
  | "story"
  | "paper"
  | "dashboard";

const ALL: HuoziFormat[] = [
  "web",
  "mobile",
  "deck",
  "story",
  "paper",
  "dashboard",
];

/** Set of formats that have [data-page] structure → pager + outline.
 *  Dashboard is *not* paginated — it uses `[data-tab]` + a separate tab
 *  bar, a different contract from prev/next pagination. */
export const PAGINATED: ReadonlySet<HuoziFormat> = new Set<HuoziFormat>([
  "deck",
  "story",
  "paper",
]);

export function isPaginated(format: HuoziFormat): boolean {
  return PAGINATED.has(format);
}

/** Pager axis derived from format. `null` means no pager (long-flow OR
 *  the format uses its own navigation chrome — dashboard's tab bar). */
export type PagerOrientation = "horizontal" | "vertical";

export function pagerOrientationFor(
  format: HuoziFormat,
): PagerOrientation | null {
  switch (format) {
    case "deck":
      return "horizontal";
    case "story":
    case "paper":
      return "vertical";
    case "mobile":
    case "web":
    case "dashboard":
      return null;
  }
}

const META_RE =
  /<meta\s+name=["']huozi:format["']\s+content=["']([a-z]+)["']/gi;

function classRe(format: HuoziFormat): RegExp {
  return new RegExp(`class=["'][^"']*\\bhuozi-${format}\\b`, "gi");
}

/**
 * Build skip-ranges for inert HTML regions: comments, <pre>, <code>,
 * <style>, <script>. Patterns inside these aren't real HTML — they're
 * displayed as text (code examples / spec docs that demonstrate the
 * very syntax we're detecting). Without this, a spec doc that shows
 * `<body class="huozi-deck">` inside <pre><code> would be falsely
 * detected as a deck, locking ShareViewer's viewport-pinned mode and
 * breaking scroll for the long-form prose.
 */
function buildSkipRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const sources: RegExp[] = [
    /<!--[\s\S]*?-->/g,
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
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

export function detectHuoziFormat(html: string): HuoziFormat {
  const skip = buildSkipRanges(html);

  // 1. meta tag is the authoritative declaration. Skip matches inside
  //    inert regions (the spec doc shows `<meta huozi:format=...>` examples
  //    inside <pre><code>).
  const metaRe = new RegExp(META_RE.source, META_RE.flags);
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRe.exec(html)) !== null) {
    if (isInRanges(metaMatch.index, skip)) continue;
    const v = metaMatch[1]?.toLowerCase();
    if (v && (ALL as string[]).includes(v)) return v as HuoziFormat;
  }

  // 2. Class sniff (legacy / hand-rolled HTML using a template's class).
  //    Same skip-ranges — spec docs demonstrate `class="huozi-deck"` in
  //    code examples and must not self-report as a deck.
  for (const f of ALL) {
    const re = classRe(f);
    let classMatch: RegExpExecArray | null;
    while ((classMatch = re.exec(html)) !== null) {
      if (isInRanges(classMatch.index, skip)) continue;
      return f;
    }
  }

  // 3. Default: standard web. The publish view treats unmarked HTML as a
  //    plain long page — no pager, no auto-rotate, natural extend.
  return "web";
}
