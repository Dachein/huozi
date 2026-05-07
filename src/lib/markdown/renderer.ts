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
import { rehypeObjSrc, SOURCE_POS_BLOCK_TAGS } from "./source-pos";

// Build a sanitize schema. When `withSourcePos` is true, the plan permits
// `data-obj-src` on every block-level tag the source-pos plugin annotates.
// The attribute name in hast is the camelCased property `dataObjSrc`.
function buildSchema(withSourcePos: boolean): Parameters<typeof rehypeSanitize>[0] {
  type AttrList = NonNullable<
    NonNullable<Parameters<typeof rehypeSanitize>[0]>["attributes"]
  >[string];
  const baseAttrs: Record<string, AttrList> = {
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
  };
  if (withSourcePos) {
    for (const tag of SOURCE_POS_BLOCK_TAGS) {
      baseAttrs[tag] = [
        ...((baseAttrs[tag] as AttrList) || []),
        "dataObjSrc",
      ];
    }
  }
  return {
    ...defaultSchema,
    attributes: baseAttrs,
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
}

function buildProcessor(withSourcePos: boolean) {
  // rehypeObjSrc must run BEFORE rehypeSanitize: hast-util-sanitize creates
  // new nodes and drops `node.position`, so positions are only available
  // pre-sanitize. The schema (above) whitelists `dataObjSrc` so the attribute
  // we attach survives sanitization.
  //
  // Conditional `.use()` lives inside the chain via a no-op stub when
  // disabled — keeps unified's chained generic types stable across both
  // branches.
  const noop = () => () => {};
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(withSourcePos ? rehypeObjSrc : noop)
    .use(rehypeSanitize, buildSchema(withSourcePos))
    .use(rehypeHighlight, { detect: true })
    .use(rehypeKatex)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["anchor"] },
    })
    .use(rehypeStringify);
}

const processorPlain = buildProcessor(false);
const processorWithSrc = buildProcessor(true);

export interface RenderOptions {
  /**
   * If set, `/__assets__/<path>` URLs are rewritten to
   * `${assetBase}/a/<path>`. Two callers today:
   *   - `/p/<slug>` share renderer → `assetBase: "/p/<slug>"`, proxied
   *     by `src/app/p/[slug]/a/[...path]/route.ts`.
   *   - `/workspace/view` renderer → `assetBase: "/workspace"`, proxied
   *     by `src/app/(app)/workspace/a/[...path]/route.ts` (cookie-auth).
   *
   * Leave undefined ONLY for renders that won't end up in a browser
   * (e.g. server-side text extraction). Browser renders without
   * `assetBase` will 404 every `/__assets__/...` reference — there is
   * no global route serving that prefix.
   *
   * See `packages/huozi-cloud/SPEC.md` §4.8 → "URL 约定" for the
   * canonical four-layer URL shape.
   */
  assetBase?: string;
  /**
   * Annotate block-level elements (p, li, h1–h6, td/th, pre, blockquote)
   * with `data-obj-src="<startByte>,<endByte>"` referencing the original
   * markdown source. Powers the workspace inline-edit feature.
   *
   * Default: false. Workspace view turns this on; the public `/p/<slug>`
   * share viewer leaves it off so source byte positions don't leak to
   * unauthenticated readers.
   */
  withSourcePos?: boolean;
}

export async function renderMarkdown(
  markdown: string,
  opts?: RenderOptions
): Promise<string> {
  const processor = opts?.withSourcePos ? processorWithSrc : processorPlain;
  const result = await processor.process(markdown);
  let html = String(result);
  if (opts?.assetBase) {
    html = rewriteAssetUrls(html, opts.assetBase);
  }
  return html;
}

/**
 * Rewrite `/__assets__/<path>` → `${base}/a/<path>` in rendered HTML.
 * Operates on the serialized string (cheaper than a tree walk for the
 * handful-of-images common case). Matches `src="..."`, `src='...'`, and
 * `src=...` (unquoted).
 *
 * The `/__assets__/ → /a/` URL shape is dictated by Next.js's
 * private-folder convention; full rationale + 4-layer URL table lives
 * in `packages/huozi-cloud/SPEC.md` §4.8 "URL 约定".
 */
export function rewriteAssetUrls(html: string, base: string): string {
  // Strip trailing slashes; the path being rewritten already starts with `/`.
  const b = base.replace(/\/+$/, "");
  return html.replace(
    /(src|href)=("|'|)\/__assets__\/([^"'\s>]+)(\2)/g,
    (_m, attr, openQ, rest, closeQ) => `${attr}=${openQ}${b}/a/${rest}${closeQ}`
  );
}
