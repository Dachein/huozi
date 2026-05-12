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

/**
 * Per-render context passed to function-form bundle inits. Surface-aware
 * bundles (today: `data`) need this to embed a server-resolved value
 * (proxy base, host path, …) at render time — static strings can't.
 *
 * Static inits ignore the ctx; only the function form receives it.
 */
export interface BundleInitContext {
  /**
   * Data proxy base URL with trailing slash. Surface-resolved by the
   * caller — `/p/<slug>/d/` on publish, `/workspace/d/<host-enc>/` in
   * the workspace inline preview. The `data` bundle init embeds this
   * into `window.huozi.data` so author code uses one URL pattern across
   * surfaces.
   */
  dataBase: string;
  /**
   * Path of the host file inside the workspace. Mirrors what's encoded
   * in `dataBase` on the workspace side but is also surfaced as
   * `window.huozi.file` for author diagnostics.
   */
  filePath: string;
}

export interface BundleSpec {
  /**
   * One or more script URLs to inject as `<script defer>`. Order is
   * preserved — list dependencies first (e.g. dompurify before marked).
   * Empty array for "runtime-only" bundles like `data` where the API
   * is platform-injected via `init`, not a library load.
   */
  scripts: string[];
  /** Optional same-origin stylesheet (highlight theme, katex fonts). */
  css?: string;
  /**
   * Optional auto-init JS run on DOMContentLoaded. Tier 1 libs use this
   * to render `<pre class="mermaid">` / `<code class="language-*">` /
   * `$$ … $$` etc. without the author writing init code. Tier 2 libs
   * (charts) leave init=undefined — author owns the DOM container.
   *
   * Function form: receives the BundleInitContext so surface-aware
   * bundles (today: `data`) can embed server-resolved values. Static
   * string form is sugar for `() => init`.
   */
  init?: string | ((ctx: BundleInitContext) => string);
  /**
   * Optional setup JS that runs **eagerly** — emitted as a regular
   * (non-deferred, non-DCL-wrapped) `<script>` placed BEFORE the body
   * content, so it's already executed by the time author `<script>`
   * tags in the body parse.
   *
   * Use this when the bundle exposes an API surface that author code
   * may call inline at parse time. The `data` bundle uses it so
   * `window.huozi.read` etc. exist before any author `<script>` runs;
   * libraries that need a real DOM (highlight / katex) stay on `init`.
   *
   * No DCL guarantee, no DOM access — keep this small and side-effect-free
   * beyond assigning to `window`.
   */
  eagerInit?: string | ((ctx: BundleInitContext) => string);
}

export const FORMAT_ASSETS: Record<HuoziFormat, FormatAssets> = {
  deck: { css: ["/lib/huozi-layout-deck.css"] },
  story: { css: ["/lib/huozi-layout-story.css"] },
  paper: { css: ["/lib/huozi-layout-paper.css"] },
  mobile: { css: ["/lib/huozi-layout-mobile.css"] },
  // Big-screen, fixed-aspect, tab-navigated page. Higher information
  // density than deck. Platform CSS only ships structural rules
  // (aspect-ratio container + [data-tab] mutual-exclusive visibility);
  // typography / decoration / grid is author's.
  dashboard: { css: ["/lib/huozi-layout-dashboard.css"] },
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

  // ─── data — runtime-only bundle (no library load, just an API) ───
  // Surface-aware: the init is a function so `dataBase` can be embedded
  // at render time. Author opts in with `<meta huozi:bundle="data">`
  // and declares dependencies via `<meta huozi:share-include="a.jsonl,…">`.
  // The proxy endpoints (`/p/<slug>/d/*` for publish,
  // `/workspace/d/<host>/*` for workspace inline) enforce the allowlist.
  //
  // `window.huozi.on('tab', fn)` is co-located here even though it's
  // owned by the DashboardTabBar component: the bus is just a thin
  // wrapper over a shared EventTarget so the data bundle keeps being
  // the one place where `window.huozi` is initialized. TabBar wires
  // events into the same bus from the React side.
  data: {
    scripts: [],
    eagerInit: (ctx) => `
window.huozi = window.huozi || {};
window.huozi.data = ${JSON.stringify(ctx.dataBase)};
window.huozi.file = ${JSON.stringify(ctx.filePath)};
window.huozi.read = function (p) {
  return fetch(window.huozi.data + p, { credentials: 'same-origin' }).then(function (r) {
    if (!r.ok) throw new Error('huozi.read ' + p + ' → ' + r.status);
    return r.text();
  });
};
window.huozi.readJson = function (p) {
  return window.huozi.read(p).then(function (t) { return JSON.parse(t); });
};
window.huozi.readJsonl = function (p) {
  return window.huozi.read(p).then(function (t) {
    return t.trim().split('\\n').filter(Boolean).map(function (line) { return JSON.parse(line); });
  });
};
if (!window.huozi.__bus) {
  window.huozi.__bus = new EventTarget();
  window.huozi.on = function (name, fn) {
    var w = function (e) { fn(e.detail); };
    fn.__w = w;
    window.huozi.__bus.addEventListener(name, w);
  };
  window.huozi.off = function (name, fn) {
    if (fn && fn.__w) window.huozi.__bus.removeEventListener(name, fn.__w);
  };
  window.huozi.emit = function (name, detail) {
    window.huozi.__bus.dispatchEvent(new CustomEvent(name, { detail: detail }));
  };
  window.huozi.refresh = function () {
    var tabId = (window.huozi.tabs && window.huozi.activeTab) || null;
    window.huozi.emit('tab', { tabId: tabId, reason: 'refresh' });
  };
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
  // vega-lite, chartjs — reserved keys (see below). Vega-Lite's
  // grammar-of-graphics niche overlaps ~95% with ECharts at ~3x the
  // bytes (vega + vega-lite + vega-embed ≈ 800 KB raw / ~250 KB gzip),
  // so it stays unwired until a dashboard scenario actually needs the
  // spec-as-data property.
};

/**
 * Stable list of bundle keys known to the platform. Validator
 * (validate.ts) imports this so "unknown bundle key" warnings stay
 * in sync with what's actually injectable.
 */
export const KNOWN_BUNDLE_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(BUNDLES),
  // Reserved keys — recognized by validator before runtime is wired,
  // so authors who declare them aren't flagged with a typo warning.
  // Will land in BUNDLES (above) only if a concrete dashboard scenario
  // proves the value.
  "chartjs",
  "vega-lite",
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
  /** Concatenated *eager* init source. Emitted as a non-deferred inline
   *  `<script>` placed BEFORE the body content so author `<script>`
   *  tags can use the bundle's API at parse time. No DCL wrap. */
  eagerInitSource: string;
}

export function resolveAssets(
  format: HuoziFormat,
  bundleKeys: readonly string[],
  ctx: BundleInitContext,
): ResolvedAssets {
  const cssLinks: string[] = [...FORMAT_ASSETS[format].css];
  const scriptUrls: string[] = [];
  const initSnippets: string[] = [];
  const eagerSnippets: string[] = [];

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
    if (spec.init) {
      initSnippets.push(typeof spec.init === "function" ? spec.init(ctx) : spec.init);
    }
    if (spec.eagerInit) {
      eagerSnippets.push(
        typeof spec.eagerInit === "function" ? spec.eagerInit(ctx) : spec.eagerInit,
      );
    }
  }

  return {
    cssLinks,
    scriptUrls,
    initSource: initSnippets.join("\n"),
    eagerInitSource: eagerSnippets.join("\n"),
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
