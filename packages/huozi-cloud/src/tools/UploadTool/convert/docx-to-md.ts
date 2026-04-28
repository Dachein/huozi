/**
 * docx → markdown via mammoth.
 *
 * Mammoth produces clean markdown for ~90% of typical business docs without
 * post-processing: headings, lists, tables, links, footnotes all survive.
 * What's lost (and lost intentionally — markdown can't represent it):
 *   font / color / size, page breaks, headers/footers, comments, track changes.
 *
 * Image handling: every <img> in the docx is extracted to a separate blob
 * and referenced from the markdown by relative path. The caller decides
 * where to write those blobs (typically a `<basename>.images/` sibling
 * folder). Inlining as base64 data: URIs would balloon a 100 KB docx into
 * a 5 MB markdown file — never the right default in a content-addressed
 * store where the same image bytes might appear in many documents.
 *
 * mammoth itself is async and returns warnings via `result.messages` —
 * we surface those to the agent as `warnings[]` on the upload response so
 * "your numbered list nesting was inconsistent" doesn't get swallowed.
 */

import * as mammothNs from 'mammoth'

// mammoth's TypeScript declaration omits convertToMarkdown even though the
// runtime ships it (open issue: mwilliamson/mammoth.js#580). Augment the
// type at the import boundary so call sites stay clean.
type MammothMessage = { type: 'warning' | 'error'; message: string }
const mammoth = mammothNs as unknown as typeof mammothNs & {
  convertToMarkdown: (
    input: { buffer: Buffer },
    options: {
      convertImage?: ReturnType<typeof mammothNs.images.imgElement>
    },
  ) => Promise<{ value: string; messages: MammothMessage[] }>
}

export interface DocxImage {
  /** Filename relative to the images folder, e.g. `image-1.png`. */
  filename: string
  /** MIME type as declared by docx (mammoth normalizes). */
  contentType: string
  /** Raw image bytes ready for storage.writeFile. */
  bytes: Uint8Array
}

export interface DocxConversionResult {
  markdown: string
  /** Image blobs the caller should write under `<basename>.images/`. */
  images: DocxImage[]
  /** Warnings from mammoth (style mappings dropped, etc.). Empty on clean docs. */
  warnings: string[]
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
}

/**
 * Convert docx bytes to markdown.
 *
 * @param bytes  raw docx file bytes
 * @param imageDirRel  relative path used in markdown image src, e.g.
 *                     `./report.images/`. Trailing slash required. Caller
 *                     is responsible for actually writing the image files
 *                     under the workspace path the rel path resolves to.
 */
export async function convertDocxToMarkdown(
  bytes: Uint8Array,
  imageDirRel: string,
): Promise<DocxConversionResult> {
  const images: DocxImage[] = []
  let imageCounter = 0

  // The Buffer interop layer: mammoth wants a node Buffer, but Workers
  // ship `Uint8Array`. Buffer is a Uint8Array subclass — we can construct
  // one safely without copying.
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const result = await mammoth.convertToMarkdown(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (img) => {
        const ct = img.contentType || 'application/octet-stream'
        const ext = EXT_BY_MIME[ct] ?? 'bin'
        imageCounter += 1
        const filename = `image-${imageCounter}.${ext}`

        // mammoth's `read()` without args returns base64 by default; pass
        // a buffer hint so we get raw bytes and skip the round-trip.
        const imgBuf = await img.read()
        const u8 =
          imgBuf instanceof Uint8Array
            ? imgBuf
            : new Uint8Array(Buffer.from(imgBuf as never))

        images.push({ filename, contentType: ct, bytes: u8 })

        // The src we hand back becomes the src= attribute mammoth emits.
        // Markdown converter then turns the <img> into ![](src), so this
        // is what shows up in the .md file.
        return { src: `${imageDirRel}${filename}` }
      }),
    },
  )

  return {
    markdown: result.value,
    images,
    warnings: result.messages
      .filter((m: MammothMessage) => m.type === 'warning')
      .map((m: MammothMessage) => m.message),
  }
}
