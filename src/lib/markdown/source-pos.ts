/**
 * rehype plugin: copy MDAST/hAST source positions onto a `data-obj-src`
 * attribute for block-level elements.
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
 * on the relevant block tagNames (see `renderer.ts`).
 *
 * Only block-level elements get the attribute. Inline elements (em, a,
 * code spans, …) inherit the nearest block ancestor — which is the unit
 * the inline-edit UX scopes selections to anyway.
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

const BLOCK_TAGS = new Set([
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
])

function walk(node: HastNode): void {
  if (
    node.type === 'element' &&
    node.tagName &&
    BLOCK_TAGS.has(node.tagName)
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
export const SOURCE_POS_BLOCK_TAGS = Array.from(BLOCK_TAGS)
