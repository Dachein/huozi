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

export type HuoziFormat = "web" | "mobile" | "deck" | "story" | "paper";

const ALL: HuoziFormat[] = ["web", "mobile", "deck", "story", "paper"];

/** Set of formats that have [data-page] structure → pager + outline. */
export const PAGINATED: ReadonlySet<HuoziFormat> = new Set<HuoziFormat>([
  "deck",
  "story",
  "paper",
]);

export function isPaginated(format: HuoziFormat): boolean {
  return PAGINATED.has(format);
}

/** Pager axis derived from format. `null` means no pager (long-flow). */
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
      return null;
  }
}

const META_RE =
  /<meta\s+name=["']huozi:format["']\s+content=["']([a-z]+)["']/i;

function classRe(format: HuoziFormat): RegExp {
  return new RegExp(`class=["'][^"']*\\bhuozi-${format}\\b`);
}

export function detectHuoziFormat(html: string): HuoziFormat {
  // 1. meta tag is the authoritative declaration.
  const m = html.match(META_RE);
  if (m) {
    const v = m[1].toLowerCase();
    if ((ALL as string[]).includes(v)) return v as HuoziFormat;
  }
  // 2. Class sniff (legacy / hand-rolled HTML using a template's class).
  for (const f of ALL) {
    if (classRe(f).test(html)) return f;
  }
  // 3. Default: standard web. The publish view treats unmarked HTML as a
  //    plain long page — no pager, no auto-rotate, natural extend.
  return "web";
}
