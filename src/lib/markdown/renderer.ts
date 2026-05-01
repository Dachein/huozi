import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
// Extend sanitize schema to allow KaTeX classes and math elements
const sanitizeSchema: Parameters<typeof rehypeSanitize>[0] = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div || []),
      ["className", /^math/],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ["className", /^katex/, /^math/],
      "style",
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      ["className", /^hljs/, /^language-/],
    ],
    pre: [...(defaultSchema.attributes?.pre || [])],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "math",
    "annotation",
    "semantics",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "mfrac",
    "mover",
    "munder",
    "msqrt",
    "mtable",
    "mtr",
    "mtd",
    "mtext",
    "mspace",
  ],
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeKatex)
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, {
    behavior: "wrap",
    properties: { className: ["anchor"] },
  })
  .use(rehypeStringify);

export interface RenderOptions {
  /**
   * If set, image / link URLs that start with `/__assets__/` are
   * rewritten to `${assetBase}/a/...`. Used by the `/p/<slug>` share
   * renderer to scope asset references back through a route handler
   * that can fetch from the share's workspace.
   *
   * URL segment is `/a/`, not `/__assets__/`, because Next.js treats
   * folders starting with `_` as private (excluded from routing). The
   * underlying workspace path stays `/__assets__/...`; only the public
   * URL shape changes.
   *
   * Leave undefined for contexts where assets resolve naturally
   * (workspace view inside the app, where `/__assets__/...` is a
   * routable path already).
   */
  assetBase?: string;
}

export async function renderMarkdown(
  markdown: string,
  opts?: RenderOptions
): Promise<string> {
  const result = await processor.process(markdown);
  let html = String(result);
  if (opts?.assetBase) {
    html = rewriteAssetUrls(html, opts.assetBase);
  }
  return html;
}

/**
 * Rewrite `/__assets__/<path>` references in rendered HTML to
 * `${base}/a/<path>`. Operates on the serialized string instead of the
 * rehype tree because the rewrite is a string-level concern (URL prefix
 * swap), not a structural one — and string replace is significantly
 * cheaper than a full tree walk for the common case (a handful of
 * images).
 *
 * Why `/a/` and not `/__assets__/`: Next.js treats folders starting
 * with `_` as private (skipped during routing). A `[slug]/__assets__/`
 * route would never match. The internal workspace path stays
 * `__assets__/...` — the route handler at `[slug]/a/[...path]` puts
 * `__assets__/` back when calling the worker.
 *
 * Match shape: `src="/__assets__/foo.png"`, `href='/__assets__/...'`,
 * `src=/__assets__/...` (no quotes — produced by some rehype configs).
 */
function rewriteAssetUrls(html: string, base: string): string {
  // Strip trailing slashes; the path being rewritten already starts with `/`.
  const b = base.replace(/\/+$/, "");
  return html.replace(
    /(src|href)=("|'|)\/__assets__\/([^"'\s>]+)(\2)/g,
    (_m, attr, openQ, rest, closeQ) => `${attr}=${openQ}${b}/a/${rest}${closeQ}`
  );
}
