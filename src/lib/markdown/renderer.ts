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

export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  return String(result);
}
