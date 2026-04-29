/**
 * Extract OpenGraph / Twitter / generic meta from a published HTML file's head.
 *
 * Pure regex — we only inspect the <head> region (or the first ~16 KB if there
 * is no </head>) so this stays fast even on large HTML payloads.
 *
 * Resolution per field:
 *   - title          → og:title || twitter:title || <title>
 *   - description    → og:description || twitter:description || <meta name="description">
 *   - image          → og:image || twitter:image
 *   - author         → og:author || <meta name="author"> || article:author
 *   - keywords       → <meta name="keywords"> (comma-split, trimmed)
 *   - locale         → og:locale || <html lang>
 *   - type           → og:type
 *   - twitterCard    → twitter:card
 *   - canonicalUrl   → og:url || <link rel="canonical">
 *
 * No DOM library: we parse just enough head structure to feel like a browser.
 */

export interface HtmlMeta {
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  keywords?: string[];
  locale?: string;
  type?: string;
  twitterCard?: string;
  canonicalUrl?: string;
}

const HEAD_RE = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_LANG_RE = /<html\b[^>]*\blang\s*=\s*("([^"]*)"|'([^']*)')/i;
const CANONICAL_RE =
  /<link\b[^>]*\brel\s*=\s*("canonical"|'canonical')[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/i;

/** Match a <meta> tag with name= or property= equal to `key` (case-insensitive). */
function metaRe(key: string): RegExp {
  // Two orders: name/property first, content second — and content first, name/property second.
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = `<meta\\b[^>]*\\b(?:name|property)\\s*=\\s*("${k}"|'${k}')[^>]*\\bcontent\\s*=\\s*("([^"]*)"|'([^']*)')`;
  const b = `<meta\\b[^>]*\\bcontent\\s*=\\s*("([^"]*)"|'([^']*)')[^>]*\\b(?:name|property)\\s*=\\s*("${k}"|'${k}')`;
  return new RegExp(`${a}|${b}`, "i");
}

function readMeta(head: string, key: string): string | undefined {
  const m = head.match(metaRe(key));
  if (!m) return undefined;
  // Group layout depends on which alternative matched.
  const v = m[3] ?? m[4] ?? m[6] ?? m[7];
  return v ? decodeEntities(v).trim() || undefined : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

export function extractHtmlMeta(html: string): HtmlMeta {
  // Confine the search to <head>; fall back to the first chunk if absent.
  const headMatch = html.match(HEAD_RE);
  const head = headMatch ? headMatch[1] : html.slice(0, 16_384);

  const out: HtmlMeta = {};

  const titleTag = head.match(TITLE_RE);
  const title =
    readMeta(head, "og:title") ??
    readMeta(head, "twitter:title") ??
    (titleTag ? decodeEntities(stripTags(titleTag[1])) : undefined);
  if (title) out.title = title;

  const description =
    readMeta(head, "og:description") ??
    readMeta(head, "twitter:description") ??
    readMeta(head, "description");
  if (description) out.description = description;

  const image =
    readMeta(head, "og:image") ?? readMeta(head, "twitter:image");
  if (image) out.image = image;

  const author =
    readMeta(head, "og:author") ??
    readMeta(head, "article:author") ??
    readMeta(head, "author");
  if (author) out.author = author;

  const keywords = readMeta(head, "keywords");
  if (keywords) {
    const list = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (list.length) out.keywords = list;
  }

  const langMatch = html.match(HTML_LANG_RE);
  const locale =
    readMeta(head, "og:locale") ?? langMatch?.[2] ?? langMatch?.[3];
  if (locale) out.locale = locale;

  const type = readMeta(head, "og:type");
  if (type) out.type = type;

  const twitterCard = readMeta(head, "twitter:card");
  if (twitterCard) out.twitterCard = twitterCard;

  const canonicalLink = head.match(CANONICAL_RE);
  const canonicalUrl =
    readMeta(head, "og:url") ?? canonicalLink?.[3] ?? canonicalLink?.[4];
  if (canonicalUrl) out.canonicalUrl = canonicalUrl;

  return out;
}
