/**
 * Platform asset registry — drives server-side `<link>` and `<script>`
 * injection at HTML render time.
 *
 * Two declaration channels in the author's <head>:
 *
 *   <meta name="huozi:format" content="deck">
 *     → injects the canonical layout CSS for that format. Pure structural
 *       CSS (sizing, scroll-snap, container queries, print rules). No
 *       decoration. The pager (FullscreenPager, lives outside author HTML)
 *       relies on this layout to scroll correctly via scrollIntoView.
 *
 *   <meta name="huozi:bundle" content="mermaid,echarts">
 *     → injects same-origin <script defer> for each known library plus
 *       an init shim that auto-runs Tier 1 libs on DOMContentLoaded.
 *       Tier 2 libs (echarts / uplot / chartjs / vega-lite) require
 *       authors to write their own `init()` because they need a DOM
 *       container; we just guarantee globals are available.
 *
 * Why server-side: the publish sandbox strips `<script src="cdn…">`,
 * so authors can't load CDN libs themselves. Server-injected same-origin
 * scripts survive the strip + benefit from edge caching.
 *
 * To add a new bundle: push a BundleSpec into BUNDLES with a unique key.
 * Plugin-extensible by design — no other code changes needed beyond
 * mirroring the key list in the validator's KNOWN_BUNDLES set.
 */

import type { HuoziFormat } from "./detect-format";

export interface FormatAssets {
  /** Same-origin stylesheet URLs to inject before author <style>. */
  css: string[];
}

export interface BundleSpec {
  /**
   * One or more script URLs to inject as `<script defer>`. Order is
   * preserved — list dependencies first (e.g. dompurify before marked).
   */
  scripts: string[];
  /** Optional same-origin stylesheet (highlight theme, katex fonts). */
  css?: string;
  /**
   * Optional auto-init JS run on DOMContentLoaded. Tier 1 libs use this
   * to render `<pre class="mermaid">` / `<code class="language-*">` /
   * `$$ … $$` etc. without the author writing init code. Tier 2 libs
   * (charts) leave init=undefined — author owns the DOM container.
   */
  init?: string;
}

export const FORMAT_ASSETS: Record<HuoziFormat, FormatAssets> = {
  deck: { css: ["/lib/huozi-layout-deck.css"] },
  story: { css: ["/lib/huozi-layout-story.css"] },
  paper: { css: ["/lib/huozi-layout-paper.css"] },
  mobile: { css: ["/lib/huozi-layout-mobile.css"] },
  // web is the catch-all default — long-flow desktop. No platform CSS;
  // unknown HTML stays untouched.
  web: { css: [] },
};

/**
 * Tier 1: text & docs (auto-init).
 * Tier 2: data viz (manual init by author — sub `script` + `css` only,
 * no `init` so the bundle script just exposes the global).
 *
 * Versions are pinned in the URL so the server can change them without
 * authors re-pinning.
 */
export const BUNDLES: Record<string, BundleSpec> = {
  // ─── Tier 1 (auto-init — platform runs init for the author) ─────
  // For Tier 1 you only write the markup; the init shim wires
  // everything in DOMContentLoaded.
  highlight: {
    scripts: ["/lib/highlight-11.9.0.min.js"],
    css: "/lib/highlight-github-11.9.0.min.css",
    init: `if (window.hljs) {
  document.querySelectorAll('pre code[class*="language-"], pre code[class*="lang-"]').forEach(function(el){
    window.hljs.highlightElement(el);
  });
}`,
  },
  katex: {
    scripts: [
      "/lib/katex-0.16.11.min.js",
      "/lib/katex-auto-render-0.16.11.min.js",
    ],
    css: "/lib/katex-0.16.11.min.css",
    init: `if (window.renderMathInElement) {
  window.renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\\\[', right: '\\\\]', display: true },
      { left: '\\\\(', right: '\\\\)', display: false }
    ],
    throwOnError: false
  });
}`,
  },
  marked: {
    // marked needs DOMPurify to sanitize. Order: purify first so it's
    // ready when marked init runs.
    scripts: ["/lib/dompurify-3.0.11.min.js", "/lib/marked-12.0.2.min.js"],
    init: `if (window.marked && window.DOMPurify) {
  window.huozi = window.huozi || {};
  window.huozi.md = function(s){ return window.DOMPurify.sanitize(window.marked.parse(s)); };
}`,
  },

  // ─── Tier 2 (manual init — author writes the wiring) ───────────
  // Author owns the DOM container + init call. We just guarantee the
  // global is available. Same `<meta huozi:bundle="...">` opt-in as
  // Tier 1; difference is no auto-init — gives authors theme / config
  // control, and avoids surprising side effects on inert markup.
  mermaid: {
    // Moved from Tier 1 → Tier 2 so authors can pass their own
    // `mermaid.initialize({...})` (theme, securityLevel, etc.) without
    // fighting a default. Call `mermaid.run()` after init to render
    // `<pre class="mermaid">` blocks.
    scripts: ["/lib/mermaid-10.9.4.min.js"],
  },
  echarts: {
    scripts: ["/lib/echarts-5.5.1.min.js"],
  },
  uplot: {
    scripts: ["/lib/uplot-1.6.31.iife.min.js"],
    css: "/lib/uplot-1.6.31.min.css",
  },
  "vega-lite": {
    // Vega-Lite needs vega + vega-lite + vega-embed loaded in order.
    // vega-embed is the typical entry point: `vegaEmbed(el, spec)`.
    scripts: [
      "/lib/vega-5.30.0.min.js",
      "/lib/vega-lite-5.21.0.min.js",
      "/lib/vega-embed-6.26.0.min.js",
    ],
  },
  // chartjs — key still reserved below; will gain an entry here when
  // bundled.
};

/**
 * Stable list of bundle keys known to the platform. Validator
 * (validate.ts) imports this so "unknown bundle key" warnings stay
 * in sync with what's actually injectable.
 */
export const KNOWN_BUNDLE_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(BUNDLES),
  // Tier 2 reserved keys — recognized by validator before their runtime
  // is wired, so authors who declare them aren't flagged with a typo
  // warning. Each lands in BUNDLES (above) once its JS file ships.
  "chartjs",
]);

/**
 * Resolve assets for a given (format, declared bundle keys) tuple.
 * Returns the exact `<link>` and `<script>` URLs to inject + the
 * concatenated init shim to append. Unknown bundle keys are silently
 * ignored here (validator handles surfacing the warning).
 */
export interface ResolvedAssets {
  /** CSS URLs to inject before author <style>. */
  cssLinks: string[];
  /** JS URLs to inject as <script defer>, in order. */
  scriptUrls: string[];
  /** Concatenated auto-init source to wrap in DOMContentLoaded. */
  initSource: string;
}

export function resolveAssets(
  format: HuoziFormat,
  bundleKeys: readonly string[],
): ResolvedAssets {
  const cssLinks: string[] = [...FORMAT_ASSETS[format].css];
  const scriptUrls: string[] = [];
  const initSnippets: string[] = [];

  // Dedup keys preserving first-seen order so author-declared order
  // doesn't surprise. mermaid/highlight/katex/marked have no inter-dep,
  // so order doesn't matter functionally.
  const seen = new Set<string>();
  for (const raw of bundleKeys) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const spec = BUNDLES[key];
    if (!spec) continue; // unknown key — validator warns; we silently skip
    if (spec.css) cssLinks.push(spec.css);
    for (const s of spec.scripts) scriptUrls.push(s);
    if (spec.init) initSnippets.push(spec.init);
  }

  return {
    cssLinks,
    scriptUrls,
    initSource: initSnippets.join("\n"),
  };
}

/**
 * Render the final init <script> body. Wraps all snippets in a single
 * DOMContentLoaded handler so they run after the DOM is ready and after
 * all bundle scripts have loaded (defer guarantees both).
 */
export function renderInitScript(initSource: string): string {
  if (!initSource) return "";
  return `(function(){
function __huozi_init(){
${initSource}
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __huozi_init);
} else {
  __huozi_init();
}
})();`;
}
