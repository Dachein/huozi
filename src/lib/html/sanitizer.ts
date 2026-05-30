import { injectSourcePositions } from "./source-pos";
import { ensurePageIds } from "./extract-pages";
import { detectHuoziFormat } from "./detect-format";
import {
  renderInitScript,
  resolveAssets,
  type BundleInitContext,
} from "./asset-registry";

// Dangerous CSS patterns that can execute code or load external resources
const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i, // IE CSS expressions
  /javascript\s*:/i, // javascript: in url()
  /-moz-binding/i, // Firefox XBL binding
  /behavior\s*:/i, // IE behavior
  /@import/i, // external CSS import
];

function sanitizeCssValue(value: string): string {
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(value)) {
      return "";
    }
  }
  // Strip url() with data: scheme (allow http/https)
  return value.replace(
    /url\s*\(\s*(['"]?)\s*data\s*:/gi,
    'url($1blocked:'
  );
}

/** Parse the comma-separated `<meta name="huozi:bundle">` value into a list
 *  of bundle keys. Returns [] if no such meta tag exists. */
function parseBundleMeta(html: string): string[] {
  const m = html.match(
    /<meta\s+name=["']huozi:bundle["']\s+content=["']([^"']+)["']/i,
  );
  if (!m) return [];
  return m[1]
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

// Extract <style> content and body from full HTML document
function parseHtmlDocument(html: string): {
  styles: string[];
  /** External stylesheet links — split out so callers can inline+scope. */
  stylesheets: { tag: string; href: string }[];
  /** Non-stylesheet links (icon, alternate, manifest, …). */
  otherLinks: string[];
  body: string;
  metaDescription?: string;
  metaOgTitle?: string;
  metaOgDescription?: string;
  metaOgImage?: string;
} {
  const styles: string[] = [];
  const stylesheets: { tag: string; href: string }[] = [];
  const otherLinks: string[] = [];
  const meta: Record<string, string> = {};

  // Extract <style> tags from anywhere in the document
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const cssContent = styleMatch[1].trim();
    if (cssContent) {
      styles.push(cssContent);
    }
  }

  // Extract <link> tags from anywhere in the document. We split rel=stylesheet
  // out from icon / alternate / manifest / etc.: stylesheets are the ones a
  // scoped (`scopeTo`) caller may need to inline server-side so author CSS
  // can't escape the host wrapper. Other links re-emit unchanged in unscoped
  // contexts and get dropped in scoped contexts.
  const linkRegex = /<link\b[^>]*\/?>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0];
    const relMatch = tag.match(/\srel\s*=\s*["']?([^"'\s>]+)/i);
    const rel = (relMatch?.[1] ?? "").toLowerCase();
    if (rel === "stylesheet") {
      const hrefMatch = tag.match(/\shref\s*=\s*["']([^"']+)["']/i);
      const href = hrefMatch?.[1] ?? "";
      stylesheets.push({ tag, href });
    } else {
      otherLinks.push(tag);
    }
  }

  // Extract meta tags
  const metaRegex =
    /<meta\s+(?:[^>]*?\s)?(?:name|property)\s*=\s*["']([^"']+)["'][^>]*?\scontent\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;
  const metaRegex2 =
    /<meta\s+(?:[^>]*?\s)?content\s*=\s*["']([^"']+)["'][^>]*?\s(?:name|property)\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;

  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    meta[metaMatch[1].toLowerCase()] = metaMatch[2];
  }
  while ((metaMatch = metaRegex2.exec(html)) !== null) {
    meta[metaMatch[2].toLowerCase()] = metaMatch[1];
  }

  // Extract body content, or use the whole thing if no body tag
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : html;

  // Remove any <html>, <head>, <body>, <!DOCTYPE> wrappers if no <body> tag was found
  if (!bodyMatch) {
    body = body
      .replace(/<!DOCTYPE[^>]*>/i, "")
      .replace(/<\/?html[^>]*>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<\/?body[^>]*>/gi, "");
  }

  // Remove <style> and <link> tags from body (already extracted)
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<link\b[^>]*\/?>/gi, "");

  return {
    styles,
    stylesheets,
    otherLinks,
    body: body.trim(),
    metaDescription: meta["description"],
    metaOgTitle: meta["og:title"],
    metaOgDescription: meta["og:description"],
    metaOgImage: meta["og:image"],
  };
}

// Sanitize extracted CSS
function sanitizeCss(css: string): string {
  const lines = css.split("\n");
  const sanitized: string[] = [];

  for (const line of lines) {
    // Block @import
    if (/@import/i.test(line)) continue;
    // Sanitize property values
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const prop = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1);
      const cleanValue = sanitizeCssValue(value);
      if (cleanValue) {
        sanitized.push(`${prop}:${cleanValue}`);
      }
      continue;
    }
    // Pass through selectors, braces, etc.
    sanitized.push(line);
  }

  return sanitized.join("\n");
}

export interface SanitizeResult {
  html: string;
  meta?: {
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

export interface ProcessHtmlOptions {
  /**
   * Wrap each `<style>` block in `@scope (<scopeTo>) { ... }` so the
   * embedded HTML's CSS doesn't leak into the host document. Pass the
   * selector of the host wrapper (e.g. `.huozi-html-host`).
   *
   * Top-level `:root`, `html`, and `body` selectors are rewritten to
   * `:scope` so author-declared CSS variables and base styles still take
   * effect on the wrapper. Mixed selectors like `body.dark` are not
   * rewritten and simply won't match — acceptable since deck templates
   * don't use those patterns.
   *
   * Browser support for `@scope`: Chrome/Edge 118+, Safari 17.4+,
   * Firefox 128+. On older browsers the entire scoped block is dropped
   * by the parser — deck looks unstyled but the host shell stays clean.
   *
   * Leave undefined for full-bleed surfaces (e.g. `/p/<slug>`) where the
   * file IS the page and global CSS is intentional.
   */
  scopeTo?: string;
  /**
   * If set, rewrite `/__assets__/<path>` references in HTML attributes
   * (`href`, `src`, `poster`) to `<assetBase>/a/<path>`. Mirrors the
   * markdown renderer's `assetBase` option so an author can reference
   * workspace assets the same way from either format:
   *
   *   <link rel="stylesheet" href="/__assets__/blog/v1.css">
   *   <img src="/__assets__/cover.png">
   *
   * Two callers today:
   *   - `/p/<slug>` share view → `assetBase: "/p/<slug>"` (public proxy)
   *   - `/workspace/view` →    `assetBase: "/workspace"`   (cookie-auth proxy)
   */
  assetBase?: string;
  /**
   * SSR fetcher for stylesheet bytes. Invoked once per `<link rel="stylesheet"
   * href="/__assets__/...">` so the bytes ride the same sanitize / scope /
   * dual-emit pipeline as inline `<style>` blocks instead of being loaded
   * by the browser at runtime (where `<link>` ignores `@scope` and the
   * dual-emit transform).
   *
   * Returns the CSS text or `null` to drop the link silently. Only invoked
   * for hrefs starting with `/__assets__/`; cross-origin stylesheets are
   * left alone (we can't transform what we can't fetch).
   */
  fetchAsset?: (url: string) => Promise<string | null>;
  /**
   * Unscoped sibling of `scopeTo`. When set, every `body > X` selector in
   * the emitted CSS is dual-emitted as `body > X, <hostAsBody> > X` so the
   * same author CSS works in BOTH the standalone context (real `<body>`)
   * and the embedded context (`<article class="huozi-html-host">` inside a
   * larger page). Used by `/p/<slug>` where author intent is "the file IS
   * the page" but the article actually lives one DOM level below body.
   *
   * No-op when `scopeTo` is set — that path uses `@scope` to reach the
   * same outcome more strictly (and rewrites `body` selectors to `:scope`).
   */
  hostAsBody?: string;
  /**
   * When true, run `injectSourcePositions` over the input HTML before
   * sanitization so every element carries a `data-obj-src="<start>,<end>"`
   * attribute referencing its bounds in the **original** input bytes.
   *
   * Powers the workspace inline-edit feature. The existing sanitizer
   * doesn't strip arbitrary attributes (`data-*` survives unchanged), so
   * the injected attributes ride through to the rendered DOM.
   */
  injectSourcePos?: boolean;
  /**
   * Surface-resolved context for bundle inits that need server values.
   * Today only `bundle=data` consumes it (embeds `dataBase` and `filePath`
   * into `window.huozi`). Callers MUST construct this with the right
   * proxy base for their surface:
   *   - publish (`/p/<slug>`):    `/p/<slug>/d/`
   *   - workspace inline:          `/workspace/d/<encoded-host>/`
   * `filePath` is the workspace path of the HTML being rendered.
   */
  bundleCtx?: BundleInitContext;
}

const ASSET_PREFIX = "/__assets__/";

/**
 * Rewrite `/__assets__/<path>` URLs in HTML attributes to share-scoped
 * proxy URLs. Targets `href`, `src`, `poster`. Leaves srcset, inline
 * style url(), and CSS @import alone — those can be added later if a
 * real use case appears.
 */
function rewriteAssetRefs(html: string, assetBase: string): string {
  const target = `${assetBase.replace(/\/$/, "")}/a/`;
  // Match: attr= "/__assets__/x"  or  attr= '/__assets__/x'  or  attr=/__assets__/x
  // Capture the attribute name + opening quote, the path tail, and the closing quote.
  return html.replace(
    /(\b(?:href|src|poster)\s*=\s*)(["']?)\/__assets__\/([^"'\s>]+)\2/gi,
    (_m, head: string, quote: string, tail: string) => {
      void ASSET_PREFIX; // kept for grep-ability of the constant
      return `${head}${quote}${target}${tail}${quote}`;
    },
  );
}

/** Dual-emit `body > X` selectors so they ALSO match `<hostAsBody> > X`.
 *
 * Unscoped contexts (the `/p/<slug>` share page) emit author CSS as-is to a
 * page that has its own real `<body>`, but the article HTML is wrapped in
 * an `<article class="huozi-html-host">` — so author rules like
 * `body > nav { … }` silently fail to match (article isn't a direct child
 * of body). This pass adds a parallel selector targeting the host wrapper:
 *
 *   body > nav, body > header { … }
 *     →  body > nav, .huozi-html-host > nav,
 *        body > header, .huozi-html-host > header { … }
 *
 * The original selectors are kept so the same CSS still works in standalone
 * contexts (file:// or any host without huozi's wrapper). Compound prefixes
 * like `.foo body > nav` are intentionally NOT rewritten — `body` must be a
 * fresh selector token to qualify. */
function dualEmitBodyChildren(css: string, hostAsBody: string): string {
  // Selector list ends at `,` or `{`. Capture leading boundary char so we
  // don't match `body` that's part of a longer selector chain.
  return css.replace(
    /(?<=^|[,{}])(\s*)(body\s*>\s*[^,{}]+?)(?=\s*[,{])/g,
    (_match, ws: string, sel: string) => {
      const childPart = sel.replace(/^body\s*>\s*/, "");
      return `${ws}${sel}, ${hostAsBody} > ${childPart}`;
    },
  );
}

/** Rewrite top-level `:root` / `html` / `body` selectors to `:scope` so
 *  they target the scope root (the host wrapper) instead of being dead
 *  inside `@scope`. Matches whole-token selectors followed by:
 *    `,` `{`  — `body { … }` or `body, html { … }`
 *    `>`      — `body > nav { … }` (becomes `:scope > nav` so the author's
 *                "direct child of the page" intent attaches to the host)
 *    `:`      — `body::before { … }` / `body:hover { … }`
 *  Compound selectors like `body.dark` or `body[lang]` are left alone
 *  (they wouldn't match in scope; safe default). */
function rewriteRootSelectorsToScope(css: string): string {
  return css.replace(
    /(?<=^|[\s,{}])(:root|html|body)(?=\s*[,{>:])/g,
    ":scope",
  );
}

/**
 * Minimal security filter for trusted HTML (API-key-gated content).
 * Strips only executable vectors: <script>, <iframe>, <embed>, <object>,
 * on* event handlers, and javascript: URLs. Everything else passes through
 * including <style>, inline style attributes, and all HTML tags.
 */
export async function processHtmlDirect(
  rawHtml: string,
  opts: ProcessHtmlOptions = {},
): Promise<SanitizeResult> {
  // Inject `data-obj-src` on every open tag BEFORE any other rewriting.
  // Offsets reference the original bytes — workspace inline-edit reads
  // them client-side and slices into the unmodified `data-source`.
  let html = opts.injectSourcePos ? injectSourcePositions(rawHtml) : rawHtml;

  // Inject `id="s${N}"` onto `<section data-page>` / `<article data-page>`
  // that lacks one. Mirrors the synthesis logic in extractPages so the DOM
  // and the page-list always agree on ids — pager / outline scrollIntoView
  // calls would otherwise no-op on author HTML that omits explicit ids.
  // Idempotent: existing ids are preserved untouched.
  html = ensurePageIds(html);
  let meta: SanitizeResult["meta"];

  const isFullDocument =
    /<html[\s>]/i.test(html) ||
    /<head[\s>]/i.test(html) ||
    /<!DOCTYPE/i.test(html);

  if (isFullDocument) {
    const parsed = parseHtmlDocument(html);
    const styles: string[] = [...parsed.styles];
    const consumedHrefs = new Set<string>();

    // SSR-inline workspace stylesheets (hrefs under /__assets__/) so the
    // bytes ride the same sanitize / scope / dual-emit pipeline as inline
    // `<style>` blocks. Critical for two reasons:
    //   - Scoped (workspace): `<link>` bypasses `@scope`, so leaving stylesheets
    //     external would leak `body { ... }` to the host shell.
    //   - Unscoped (share): `<link>` bytes loaded by the browser at runtime
    //     wouldn't be touched by our `body > X` dual-emit transform either,
    //     so the author's reading column would silently fail to apply.
    // External (non-/__assets__) hrefs are left untouched — we can't rewrite
    // what we can't fetch, and they're the author's choice to load globally.
    if (opts.fetchAsset) {
      // Parallel fetch: each /__assets__/ stylesheet is an independent
      // worker round-trip. Serial `await` in a loop turned N stylesheets
      // into N × ~80ms of latency on every render — for the common case
      // of 2-4 author stylesheets this alone dominated SSR time.
      const fetcher = opts.fetchAsset;
      const targets = parsed.stylesheets.filter((s) =>
        s.href.startsWith("/__assets__/"),
      );
      const fetched = await Promise.all(
        targets.map(async (sheet) => ({
          sheet,
          css: await fetcher(sheet.href),
        })),
      );
      for (const { sheet, css } of fetched) {
        if (css) {
          styles.push(css);
          consumedHrefs.add(sheet.href);
        }
      }
    }

    // ── Platform asset injection (huozi:format + huozi:bundle) ──
    // Resolve canonical layout CSS (per format) + lib JS (per bundle key)
    // from the central registry. Layout CSS is injected as <link> BEFORE
    // author <style> so author rules can override; bundle scripts are
    // appended AFTER the dangerous-tags strip below so they survive the
    // <script> stripper. Survives scope mode too — the FileRenderer's
    // tailwind !important overrides handle the size conflict in inline
    // preview.
    const huoziFormat = detectHuoziFormat(html);
    const bundleKeys = parseBundleMeta(html);
    const platformAssets = resolveAssets(
      huoziFormat,
      bundleKeys,
      // Default ctx for callers that don't opt-in (mostly tests). The
      // `data` bundle is only useful when a real surface fills these in,
      // so the defaults are deliberately broken paths — fetch() against
      // them 404s cleanly rather than silently hitting a wrong endpoint.
      opts.bundleCtx ?? { dataBase: "/__no_data_base__/", filePath: "" },
    );

    // Rebuild: links + styles + eager-init + body
    const parts: string[] = [];

    // Platform format-CSS first — author CSS cascades on top.
    for (const url of platformAssets.cssLinks) {
      parts.push(`<link rel="stylesheet" href="${url}">`);
    }

    if (!opts.scopeTo) {
      // Unscoped: keep stylesheets we couldn't (or didn't try to) inline,
      // plus all other <link> tags (icon / alternate / manifest / …).
      for (const sheet of parsed.stylesheets) {
        if (!consumedHrefs.has(sheet.href)) parts.push(sheet.tag);
      }
      for (const link of parsed.otherLinks) parts.push(link);
    }
    // Scoped mode drops every author <link> regardless — we can't isolate
    // them. Platform layout CSS (above) is the exception; FileRenderer's
    // [&_.huozi-deck]:!w-full overrides handle inline-preview sizing.

    for (const rawCss of styles) {
      const clean = sanitizeCss(rawCss);
      if (!clean) continue;
      let css = clean;
      if (opts.hostAsBody && !opts.scopeTo) {
        css = dualEmitBodyChildren(css, opts.hostAsBody);
      }
      const final = opts.scopeTo
        ? `@scope (${opts.scopeTo}) {\n${rewriteRootSelectorsToScope(css)}\n}`
        : css;
      parts.push(`<style>${final}</style>`);
    }
    // Eager bundle init (today: only `data`). Inline `<script>` placed
    // BEFORE author body content so `window.huozi.read` et al. exist by
    // the time author `<script>` tags in the body run at parse time.
    // Library bundles' DCL-wrapped init still appends at the end.
    if (platformAssets.eagerInitSource) {
      parts.push(`<script>${platformAssets.eagerInitSource}</script>`);
    }
    parts.push(parsed.body);
    // Stash bundle script tags + init shim separately — they get appended
    // AFTER the script stripper below so they survive the strip pass.
    html = parts.join("\n");
    meta = {
      description: parsed.metaDescription,
      ogTitle: parsed.metaOgTitle,
      ogDescription: parsed.metaOgDescription,
      ogImage: parsed.metaOgImage,
    };
  }

  // Rewrite workspace asset refs (`/__assets__/foo`) to the share-scoped
  // proxy so <link>, <img>, etc. resolve against this share's workspace.
  if (opts.assetBase) {
    html = rewriteAssetRefs(html, opts.assetBase);
  }

  // Strip dangerous tags and their content.
  //
  // Scripts: only strip `<script ... src=...>` (with a src attribute).
  // Inline `<script>...</script>` (no src) is preserved — this is the
  // documented sandbox contract (see HUOZI_INSTRUCTIONS "HTML — sandbox
  // & libraries") and matches what `huozi_validate` warns about
  // (external src only). Authors writing dashboards / interactive pages
  // need inline JS to read sibling files via `<meta huozi:share-include>`.
  // on* handlers and javascript: URLs are still neutralized below, so
  // markup-level XSS vectors stay closed.
  html = html.replace(/<script\b[^>]*\ssrc\s*=[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<embed\b[^>]*>\s*(?:<\/embed>)?/gi, "");
  html = html.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "");

  // Strip on* event handler attributes (onclick, onerror, onload, etc.)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript: URLs in href/src/action attributes
  html = html.replace(
    /((?:href|src|action)\s*=\s*(?:["']))(\s*javascript\s*:)/gi,
    "$1#blocked:"
  );

  // ── Append platform bundle scripts AFTER the strip ──
  // The author's <script src="https://cdn…"> got stripped above, but our
  // huozi-injected same-origin bundle scripts must survive. Append them
  // here so the strip regex can't see them. Init shim runs after all
  // bundles loaded (defer + DOMContentLoaded).
  if (isFullDocument) {
    const huoziFormat = detectHuoziFormat(rawHtml);
    const bundleKeys = parseBundleMeta(rawHtml);
    const platformAssets = resolveAssets(
      huoziFormat,
      bundleKeys,
      opts.bundleCtx ?? { dataBase: "/__no_data_base__/", filePath: "" },
    );
    const scriptTags: string[] = [];
    for (const url of platformAssets.scriptUrls) {
      scriptTags.push(`<script defer src="${url}"></script>`);
    }
    const initBody = renderInitScript(platformAssets.initSource);
    if (initBody) {
      // Inline init shim — uses defer-equivalent ordering: it inspects
      // document.readyState and either listens for DOMContentLoaded or
      // runs immediately. Either way fires after the deferred bundle
      // scripts have loaded.
      scriptTags.push(`<script>${initBody}</script>`);
    }
    if (scriptTags.length > 0) {
      html = `${html}\n${scriptTags.join("\n")}`;
    }
  }

  return {
    html: html.trim(),
    meta: meta && Object.values(meta).some(Boolean) ? meta : undefined,
  };
}

