import sanitizeHtml from "sanitize-html";

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

// All standard HTML tags except script/iframe/embed/object
const ALLOWED_TAGS = [
  // Document structure
  "div", "span", "p", "br", "hr",
  // Headings
  "h1", "h2", "h3", "h4", "h5", "h6",
  // Text formatting
  "a", "b", "i", "u", "s", "em", "strong", "small", "sub", "sup",
  "mark", "del", "ins", "abbr", "cite", "q", "blockquote", "pre", "code",
  "kbd", "samp", "var", "time", "ruby", "rt", "rp", "bdi", "bdo", "wbr",
  // Lists
  "ul", "ol", "li", "dl", "dt", "dd",
  // Tables
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  // Media
  "img", "picture", "source", "figure", "figcaption", "audio", "video", "track",
  // Forms (display only — no submit)
  "form", "input", "textarea", "select", "option", "optgroup", "label",
  "fieldset", "legend", "button", "output", "meter", "progress", "datalist",
  // Semantic
  "article", "aside", "details", "summary", "dialog",
  "header", "footer", "main", "nav", "section",
  "address", "hgroup", "search",
  // SVG basics
  "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon",
  "rect", "text", "tspan", "defs", "use", "symbol", "clipPath",
  "linearGradient", "radialGradient", "stop", "mask", "pattern",
  "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
  "feComposite", "feFlood", "feMerge", "feMergeNode",
  // Math
  "math", "annotation", "semantics", "mrow", "mi", "mo", "mn",
  "msup", "msub", "mfrac", "mover", "munder", "msqrt",
  "mtable", "mtr", "mtd", "mtext", "mspace",
];

const ALLOWED_ATTRIBUTES: Record<string, sanitizeHtml.AllowedAttribute[]> = {
  "*": [
    "class", "id", "style", "title", "lang", "dir", "role",
    "aria-*", "data-*", "tabindex", "hidden",
  ],
  a: ["href", "target", "rel", "download"],
  img: ["src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes"],
  video: ["src", "poster", "controls", "width", "height", "autoplay", "loop", "muted", "preload", "playsinline"],
  audio: ["src", "controls", "autoplay", "loop", "muted", "preload"],
  source: ["src", "srcset", "type", "media", "sizes"],
  track: ["src", "kind", "srclang", "label", "default"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope"],
  col: ["span"],
  colgroup: ["span"],
  time: ["datetime"],
  meter: ["value", "min", "max", "low", "high", "optimum"],
  progress: ["value", "max"],
  input: ["type", "value", "placeholder", "checked", "disabled", "readonly", "name", "min", "max", "step", "pattern"],
  textarea: ["placeholder", "rows", "cols", "disabled", "readonly"],
  select: ["disabled", "multiple", "size"],
  option: ["value", "selected", "disabled"],
  label: ["for"],
  button: ["type", "disabled"],
  form: ["action", "method"],
  details: ["open"],
  dialog: ["open"],
  // SVG attributes
  svg: ["viewBox", "xmlns", "width", "height", "fill", "stroke", "preserveAspectRatio"],
  path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "opacity", "fill-rule", "clip-rule"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
  polyline: ["points", "fill", "stroke", "stroke-width"],
  polygon: ["points", "fill", "stroke", "stroke-width"],
  rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"],
  text: ["x", "y", "dx", "dy", "text-anchor", "font-size", "fill", "transform"],
  tspan: ["x", "y", "dx", "dy"],
  g: ["transform", "fill", "stroke", "opacity"],
  use: ["href", "x", "y", "width", "height"],
  symbol: ["viewBox", "id"],
  clipPath: ["id"],
  linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform"],
  radialGradient: ["id", "cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform"],
  stop: ["offset", "stop-color", "stop-opacity"],
  mask: ["id", "x", "y", "width", "height"],
  filter: ["id", "x", "y", "width", "height"],
  feGaussianBlur: ["in", "stdDeviation", "result"],
  feOffset: ["in", "dx", "dy", "result"],
  feBlend: ["in", "in2", "mode", "result"],
  feColorMatrix: ["in", "type", "values", "result"],
  feComposite: ["in", "in2", "operator", "result"],
  feFlood: ["flood-color", "flood-opacity", "result"],
  feMerge: [],
  feMergeNode: ["in"],
};

export interface SanitizeResult {
  html: string;
  meta?: {
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

export function sanitizeHtmlContent(rawHtml: string): SanitizeResult {
  const isFullDocument =
    /<html[\s>]/i.test(rawHtml) ||
    /<head[\s>]/i.test(rawHtml) ||
    /<!DOCTYPE/i.test(rawHtml);

  let bodyHtml: string;
  let styles: string[] = [];
  let meta: SanitizeResult["meta"];

  if (isFullDocument) {
    const parsed = parseHtmlDocument(rawHtml);
    bodyHtml = parsed.body;
    styles = parsed.styles;
    meta = {
      description: parsed.metaDescription,
      ogTitle: parsed.metaOgTitle,
      ogDescription: parsed.metaOgDescription,
      ogImage: parsed.metaOgImage,
    };
  } else {
    // Fragment — extract inline <style> tags
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(rawHtml)) !== null) {
      styles.push(match[1].trim());
    }
    bodyHtml = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  }

  // Sanitize the body HTML
  const cleanBody = sanitizeHtml(bodyHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    // Strip all event handlers (onclick, onerror, etc.)
    exclusiveFilter: (frame) => {
      if (frame.tag === "script" || frame.tag === "iframe" || frame.tag === "embed" || frame.tag === "object") {
        return true;
      }
      return false;
    },
    transformTags: {
      a: (tagName, attribs) => {
        // Add rel="noopener noreferrer" and target="_blank" for external links
        if (attribs.href && /^https?:\/\//i.test(attribs.href)) {
          attribs.target = "_blank";
          attribs.rel = "noopener noreferrer";
        }
        // Block javascript: URLs
        if (attribs.href && /^\s*javascript\s*:/i.test(attribs.href)) {
          attribs.href = "#";
        }
        return { tagName, attribs };
      },
      form: (tagName, attribs) => {
        // Block form submissions
        delete attribs.action;
        delete attribs.method;
        return { tagName, attribs };
      },
    },
  });

  // Sanitize and combine CSS
  const cleanStyles = styles
    .map(sanitizeCss)
    .filter(Boolean)
    .join("\n");

  // Build final HTML
  const parts: string[] = [];
  if (cleanStyles) {
    parts.push(`<style>${cleanStyles}</style>`);
  }
  parts.push(cleanBody);

  return {
    html: parts.join("\n"),
    meta: meta && Object.values(meta).some(Boolean) ? meta : undefined,
  };
}
