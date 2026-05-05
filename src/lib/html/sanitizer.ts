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
   * SSR fetcher for stylesheet bytes. Called once per `<link rel="stylesheet"
   * href="/__assets__/...">` when `scopeTo` is also set, so that external
   * stylesheets get inlined as `<style>` and routed through the same `@scope`
   * wrapper as inline `<style>` blocks. Returns the CSS text or `null` to
   * drop the link silently.
   *
   * Without this, scoped contexts would leak — `<link>` tags ignore `@scope`,
   * so author rules like `body { ... }` would still hit the workspace shell.
   *
   * Only invoked for hrefs starting with `/__assets__/`. Cross-origin
   * stylesheets are dropped in scoped contexts (we can't isolate what we
   * can't fetch). Unscoped contexts (`/p/<slug>` share view) keep `<link>`
   * tags untouched and never hit this hook.
   */
  fetchAsset?: (url: string) => Promise<string | null>;
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

/** Rewrite top-level `:root` / `html` / `body` selectors to `:scope` so
 *  they target the scope root (the host wrapper) instead of being dead
 *  inside `@scope`. Only matches whole-token selectors followed by `,`
 *  or `{`; compound selectors like `body.dark` or `html > body` are left
 *  alone (they won't match anything in scope, which is the safe default). */
function rewriteRootSelectorsToScope(css: string): string {
  return css.replace(
    /(?<=^|[\s,{}])(:root|html|body)(?=\s*[,{])/g,
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
  let html = rawHtml;
  let meta: SanitizeResult["meta"];

  const isFullDocument =
    /<html[\s>]/i.test(html) ||
    /<head[\s>]/i.test(html) ||
    /<!DOCTYPE/i.test(html);

  if (isFullDocument) {
    const parsed = parseHtmlDocument(html);
    const styles: string[] = [...parsed.styles];

    // Scoped contexts (workspace inline preview): `<link rel="stylesheet">`
    // bypasses `@scope`, so author rules like `body { ... }` would leak to
    // the host shell. We fix that by SSR-fetching `/__assets__/*` stylesheets
    // and folding their bytes into `styles[]` — they then ride the same
    // sanitize + `@scope` path as inline `<style>` blocks. Cross-origin and
    // non-stylesheet `<link>` tags get dropped in scoped mode (we can't
    // isolate what we can't inline).
    //
    // Unscoped contexts (`/p/<slug>` share view, where the file IS the page)
    // keep all `<link>` tags untouched — global CSS is intentional there.
    if (opts.scopeTo && opts.fetchAsset) {
      for (const sheet of parsed.stylesheets) {
        if (!sheet.href.startsWith("/__assets__/")) continue;
        const css = await opts.fetchAsset(sheet.href);
        if (css) styles.push(css);
      }
    }

    // Rebuild: links + styles + body
    const parts: string[] = [];
    if (!opts.scopeTo) {
      for (const sheet of parsed.stylesheets) parts.push(sheet.tag);
      for (const link of parsed.otherLinks) parts.push(link);
    }
    for (const css of styles) {
      const clean = sanitizeCss(css);
      if (!clean) continue;
      const final = opts.scopeTo
        ? `@scope (${opts.scopeTo}) {\n${rewriteRootSelectorsToScope(clean)}\n}`
        : clean;
      parts.push(`<style>${final}</style>`);
    }
    parts.push(parsed.body);
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

  // Strip dangerous tags and their content
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
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

  return {
    html: html.trim(),
    meta: meta && Object.values(meta).some(Boolean) ? meta : undefined,
  };
}

