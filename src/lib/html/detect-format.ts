/**
 * Detect which of the 5 huozi standard layouts a given HTML file uses.
 *
 * Resolution order:
 *   1. <meta name="huozi:format" content="..."> in <head>. Authoritative when
 *      present; agents should always set this when writing huozi-templated HTML.
 *   2. Class sniff on the body root (.huozi-{deck,story,paper,dashboard,blog}).
 *      Pre-meta legacy files lean on this.
 *   3. Default: "blog" — the catch-all for unmarked HTML. Responsive
 *      long-flow content like an article or landing page renders as blog:
 *      no pager, no auto-rotate, adapts to whatever container it lands in.
 *
 * Deprecated formats (`mobile`, `web`):
 *   Earlier taxonomies split long-flow into a "mobile" reading column
 *   vs a "web" desktop page. In practice every modern long-form HTML is
 *   responsive — the same file should render well on phone and desktop
 *   without the author having to declare which audience they're targeting.
 *   "blog" subsumes both. Files still declaring `huozi:format=mobile` or
 *   `="web"` fall back to "blog" at render time but the validator flags
 *   the meta as deprecated so authors update the marker on their next
 *   edit pass.
 */

export type HuoziFormat =
  | "deck"
  | "story"
  | "paper"
  | "dashboard"
  | "blog";

const ALL: HuoziFormat[] = [
  "deck",
  "story",
  "paper",
  "dashboard",
  "blog",
];

/** Format strings the detector recognizes from author metadata for
 *  back-compat, but which alias to a canonical `HuoziFormat`. The
 *  validator surfaces these as deprecated. */
const DEPRECATED_ALIAS: Record<string, HuoziFormat> = {
  mobile: "blog",
  web: "blog",
};

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
    case "dashboard":
    case "blog":
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
    if (!v) continue;
    if ((ALL as string[]).includes(v)) return v as HuoziFormat;
    if (v in DEPRECATED_ALIAS) {
      // Author declared a deprecated format. Render-time we silently
      // alias to the canonical successor; the validator surfaces the
      // deprecation so the meta gets updated on next save.
      return DEPRECATED_ALIAS[v]!;
    }
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
  // Deprecated class roots (.huozi-mobile / .huozi-web) → alias to blog.
  for (const [alias, target] of Object.entries(DEPRECATED_ALIAS)) {
    const re = new RegExp(`class=["'][^"']*\\bhuozi-${alias}\\b`, "gi");
    let classMatch: RegExpExecArray | null;
    while ((classMatch = re.exec(html)) !== null) {
      if (isInRanges(classMatch.index, skip)) continue;
      return target;
    }
  }

  // 3. Default: blog. Unmarked HTML is treated as a responsive long-form
  //    article — no pager, no auto-rotate, natural extend.
  return "blog";
}

/** Names of `huozi:format` values that still parse for back-compat but
 *  should warn the author. Consumed by `validate.ts`. */
export const DEPRECATED_FORMATS: ReadonlySet<string> = new Set(
  Object.keys(DEPRECATED_ALIAS),
);
