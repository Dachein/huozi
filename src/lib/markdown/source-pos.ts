/**
 * rehype plugin: copy MDAST/hAST source positions onto a `data-obj-src`
 * attribute for block- AND inline-level elements.
 *
 * Powers the workspace inline-edit feature — the client maps a DOM
 * selection back to a byte range in the original markdown source by
 * walking up to the nearest ancestor element with `data-obj-src`.
 *
 * Format: `data-obj-src="<startByte>,<endByte>"`. Both offsets are byte
 * positions into the original markdown string (UTF-8). The end is
 * exclusive (matches `node.position.end.offset`).
 *
 * The plugin runs BEFORE rehype-sanitize so positions on the original
 * tree are still present; the sanitize schema must allow `data-obj-src`
 * on the relevant tagNames (see `renderer.ts`).
 *
 * Inline tags (em, strong, a, code, …) get their own data-obj-src so the
 * inline-edit UX can drill from a paragraph into the smallest semantic
 * unit. Selection inside `<strong>bold</strong>` walks up to the
 * `<strong>` element, the modal shows the source bytes (`**bold**`),
 * and save replaces only those bytes — minimal local edit.
 */

interface HastNode {
  type: string
  tagName?: string
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

// Block-level units the user can drill INTO from a hierarchy of inline
// elements. Listed first so SOURCE_POS_TAGS export stays meaningful.
const BLOCK_TAGS_LIST = [
  'p',
  'li',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'blockquote',
] as const

// Inline tags that carry meaningful semantic boundaries (typically the
// smallest "object" a user wants to surgically edit). MDAST surfaces
// `position` for these via remark-rehype, so the offset annotation is
// faithful to the original markdown bytes (`**bold**`, `[text](url)`).
const INLINE_TAGS_LIST = [
  'em',
  'strong',
  'a',
  'code',
  'del',
  'ins',
  'kbd',
  'mark',
  'sub',
  'sup',
] as const

const OBJ_TAGS = new Set<string>([...BLOCK_TAGS_LIST, ...INLINE_TAGS_LIST])

function walk(node: HastNode): void {
  if (
    node.type === 'element' &&
    node.tagName &&
    OBJ_TAGS.has(node.tagName)
  ) {
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (typeof start === 'number' && typeof end === 'number') {
      node.properties = node.properties ?? {}
      node.properties['dataObjSrc'] = `${start},${end}`
    }
  }
  if (node.children) {
    for (const child of node.children) walk(child)
  }
}

export function rehypeObjSrc() {
  return (tree: HastNode): void => {
    walk(tree)
  }
}

/** Tag names that get a `data-obj-src` attribute. Exported so the sanitize
 *  schema can be extended to permit the attribute on these elements only. */
export const SOURCE_POS_BLOCK_TAGS = Array.from(OBJ_TAGS)
