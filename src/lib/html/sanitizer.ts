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
  body: string;
  metaDescription?: string;
  metaOgTitle?: string;
  metaOgDescription?: string;
  metaOgImage?: string;
} {
  const styles: string[] = [];
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

  // Remove <style> tags from body (already extracted)
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  return {
    styles,
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
export function processHtmlDirect(
  rawHtml: string,
  opts: ProcessHtmlOptions = {},
): SanitizeResult {
  let html = rawHtml;
  let meta: SanitizeResult["meta"];

  const isFullDocument =
    /<html[\s>]/i.test(html) ||
    /<head[\s>]/i.test(html) ||
    /<!DOCTYPE/i.test(html);

  if (isFullDocument) {
    const parsed = parseHtmlDocument(html);
    // Rebuild: styles + body
    const parts: string[] = [];
    for (const css of parsed.styles) {
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

