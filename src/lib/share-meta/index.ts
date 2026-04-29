/**
 * Unified share metadata: turns the raw bytes of a published file into the
 * fields generateMetadata in /p/[slug]/page.tsx needs.
 *
 * Resolution order, per field:
 *   1. Explicit metadata in the file (HTML <meta> or md frontmatter).
 *   2. Inferred from content (HTML <title>, md first H1).
 *   3. Filename-based fallback.
 *
 * The image fallback is `/opengraph-image` — the Next-generated 1200×630 PNG
 * defined at src/app/opengraph-image.tsx (the 字 / 文 / huozi.app banner).
 * PNG over SVG so every social platform (Twitter, FB, WeChat, LINE) renders
 * a card. Authors opt in to a custom image via:
 *   - HTML:  <meta property="og:image" content="https://...">
 *   - md:    image: https://...   (frontmatter)
 */

import { extractHtmlMeta, type HtmlMeta } from "./extract-html";
import { parseMarkdown } from "./extract-markdown";

export interface ShareMeta {
  title: string;
  description: string;
  image: string;
  /** True if `image` came from the file itself, false if it's the site default. */
  imageIsCustom: boolean;
  type: "website" | "article";
  locale?: string;
  authors?: string[];
  keywords?: string[];
  twitterCard: "summary" | "summary_large_image";
  /** Markdown body with frontmatter stripped — caller passes this to renderMarkdown. */
  markdownContent?: string;
}

export const DEFAULT_OG_IMAGE = "/opengraph-image";

const PROSE_EXTS = new Set(["md", "mdx", "html", "htm"]);

function extOf(filePath: string): string {
  const i = filePath.lastIndexOf(".");
  return i < 0 ? "" : filePath.slice(i + 1).toLowerCase();
}

function basenameNoExt(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const i = base.lastIndexOf(".");
  return i < 0 ? base : base.slice(0, i);
}

function descriptionFor(filePath: string, ext: string): string {
  const base = basenameNoExt(filePath) || "Untitled";
  if (ext === "md" || ext === "mdx") {
    return `${base} — a markdown document published on huozi.app.`;
  }
  if (ext === "html" || ext === "htm") {
    return `${base} — a web page published on huozi.app.`;
  }
  if (ext === "csv" || ext === "tsv") {
    return `${base} — a tabular dataset published on huozi.app.`;
  }
  return `${base} — a file shared on huozi.app.`;
}

function clamp(s: string, max = 280): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const list = v.map((x) => String(x).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof v === "string" && v.trim()) {
    const list = v.split(",").map((s) => s.trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

/**
 * Collapse markdown body to a one-paragraph summary for the description fallback.
 * Drops headings, code fences, list markers, links — just enough to produce
 * something readable for a card.
 */
function summarizeMarkdown(body: string): string | undefined {
  const stripped = body
    .replace(/^---[\s\S]*?\n---\s*\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? clamp(stripped) : undefined;
}

function summarizeHtml(html: string): string | undefined {
  // First paragraph-like chunk inside body, with tags stripped.
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const noScript = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return noScript ? clamp(noScript) : undefined;
}

export function extractShareMeta(
  filePath: string,
  text: string | undefined,
): ShareMeta {
  const ext = extOf(filePath);
  const filename = basenameNoExt(filePath) || "Untitled";

  // Bare-bones default — used for non-prose extensions or when we have no text.
  const defaults: ShareMeta = {
    title: filename,
    description: descriptionFor(filePath, ext),
    image: DEFAULT_OG_IMAGE,
    imageIsCustom: false,
    type: "article",
    twitterCard: "summary_large_image",
  };

  if (!text || !PROSE_EXTS.has(ext)) {
    return defaults;
  }

  if (ext === "html" || ext === "htm") {
    const meta = extractHtmlMeta(text);
    return mergeHtmlMeta(defaults, meta, text);
  }

  // md / mdx
  const parsed = parseMarkdown(text);
  const data = parsed.data;

  const title =
    asString(data.title) ?? parsed.firstHeading ?? defaults.title;
  const description =
    asString(data.description) ??
    asString(data.summary) ??
    asString(data.excerpt) ??
    summarizeMarkdown(parsed.content) ??
    defaults.description;

  const customImage =
    asString(data.image) ??
    asString(data.og_image) ??
    asString((data as Record<string, unknown>)["og:image"]);
  const image = customImage ?? defaults.image;

  const authors = asStringArray(data.author) ?? asStringArray(data.authors);
  const keywords = asStringArray(data.keywords) ?? asStringArray(data.tags);

  const locale = asString(data.locale) ?? asString(data.lang);

  const typeFromData = asString(data.type);
  const type: ShareMeta["type"] =
    typeFromData === "website" ? "website" : "article";

  return {
    title: clamp(title, 120),
    description: clamp(description),
    image,
    imageIsCustom: Boolean(customImage),
    type,
    locale,
    authors,
    keywords,
    twitterCard: customImage ? "summary_large_image" : defaults.twitterCard,
    markdownContent: parsed.content,
  };
}

function mergeHtmlMeta(
  defaults: ShareMeta,
  meta: HtmlMeta,
  rawHtml: string,
): ShareMeta {
  const title = meta.title ?? defaults.title;
  const description =
    meta.description ?? summarizeHtml(rawHtml) ?? defaults.description;
  const customImage = meta.image;
  const image = customImage ?? defaults.image;
  const type: ShareMeta["type"] = meta.type === "website" ? "website" : "article";
  const twitterCard: ShareMeta["twitterCard"] =
    meta.twitterCard === "summary"
      ? "summary"
      : customImage
        ? "summary_large_image"
        : defaults.twitterCard;

  return {
    title: clamp(title, 120),
    description: clamp(description),
    image,
    imageIsCustom: Boolean(customImage),
    type,
    locale: meta.locale,
    authors: meta.author ? [meta.author] : undefined,
    keywords: meta.keywords,
    twitterCard,
  };
}
