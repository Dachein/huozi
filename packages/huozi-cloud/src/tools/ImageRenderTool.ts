/**
 * huozi_image_render — render SVG (v1) / Mermaid (v2) source to PNG and
 * save into the workspace's standard image library.
 *
 * Aligns with SPEC §4.8.
 *
 * Why this lives next to huozi_upload but is NOT the same tool:
 *   - huozi_upload accepts ALREADY-RENDERED bytes (image-gen model output,
 *     user screenshot, etc.). The agent owns the render step.
 *   - huozi_image_render accepts SOURCE CODE (SVG markup, Mermaid DSL)
 *     and the server owns the render step. Same content-addressed storage,
 *     different upstream pipeline.
 *
 * Path convention (SPEC §4.8):
 *   - `save_to` provided → use as-is (must end in .png, no traversal)
 *   - `save_to` absent → /__assets__/<blob-sha-prefix>.png
 *
 * The image library lives at `/__assets__/`. Markdown should reference
 * images as `![alt](/__assets__/...)`. The /p/<slug> share renderer is
 * responsible for rewriting these paths to public blob URLs at view time.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { SvgRenderer } from '../render/svgRenderer.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const IMAGE_RENDER_TOOL_NAME = 'huozi_image_render'

/**
 * 5 MB output cap. Larger images suggest the user wanted desktop-res
 * but called the tool with too-aggressive scale; the recoverable action
 * is "lower scale and retry", not "upgrade your plan".
 */
export const MAX_RENDERED_PNG_BYTES = 5 * 1024 * 1024

const DEFAULT_ASSETS_PREFIX = '/__assets__/'

export const imageRenderInputSchema = z.object({
  format: z
    .literal('svg')
    .describe('Source format. v1 supports "svg" only. Mermaid is v2.'),
  source: z
    .string()
    .min(1)
    .describe('SVG markup. Must be a complete <svg>…</svg> document.'),
  scale: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .optional()
    .describe('Output pixel ratio. Default 2 (retina).'),
  width: z
    .number()
    .int()
    .positive()
    .max(4096)
    .optional()
    .describe(
      'Optional explicit output pixel width. When set, `scale` is ignored.',
    ),
  save_to: z
    .string()
    .optional()
    .describe(
      'Optional destination path in the workspace. Must end in .png. Default: /__assets__/<blob-sha-prefix>.png.',
    ),
  alt: z
    .string()
    .optional()
    .describe(
      'Optional alt text. Reserved for v2 image_meta indexing; ignored in v1.',
    ),
})

export type ImageRenderInput = z.infer<typeof imageRenderInputSchema>

export const imageRenderOutputSchema = z.object({
  ok: z.literal(true),
  file_path: z.string(),
  blob_sha: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
  content_type: z.literal('image/png'),
  commit_sha: z.string(),
})

export type ImageRenderOutput = z.infer<typeof imageRenderOutputSchema>

export function imageRenderPrompt(): string {
  return `Render SVG source to PNG and save it into the workspace image library.

Usage:
- ${IMAGE_RENDER_TOOL_NAME} is for diagrams the agent authors as SVG and wants
  embedded in markdown. The server renders deterministically using a
  fixed font stack (PingFang SC + Latin fallbacks). v1 supports only
  \`format: "svg"\`; Mermaid lands in v2.
- For image-generation-model output (PNG bytes returned by an external
  model), use huozi_upload instead.
- \`source\` must be a complete <svg> document — the renderer reads
  width/height from the viewBox or root width/height attributes.
- \`scale\` defaults to 2 (retina). Use 1 for inline thumbnails, 3 only
  when the diagram has dense text. \`width\` overrides scale when set.
- \`save_to\` is optional. When omitted, the file lands in
  /__assets__/<sha-prefix>.png — the standard image library path. The
  share renderer rewrites these paths to public blob URLs at /p/<slug>
  view time, so markdown can use them as-is.
- Output is capped at ${MAX_RENDERED_PNG_BYTES / 1024 / 1024} MB. Lower
  the scale or simplify the SVG if you hit the cap.
- Identical \`source + scale + width\` produce identical PNG bytes →
  identical blob_sha → R2 deduplicates. Calling the tool twice with the
  same input is safe and cheap.`
}

export interface ImageRenderToolDeps {
  storage: StorageBackend
  /** SVG renderer. Production wires `@resvg/resvg-wasm`; tests inject a fake. */
  svgRenderer: SvgRenderer
}

function shaPrefixFilename(sha: string): string {
  return `${sha.slice(0, 12)}.png`
}

function isPathSafe(path: string): boolean {
  // canonicalizePath already rejects traversal and absolute escapes;
  // here we only enforce the .png extension.
  return /\.png$/i.test(path)
}

export function createImageRenderTool(
  deps: ImageRenderToolDeps,
): Tool<ImageRenderInput, ImageRenderOutput> {
  return buildTool<ImageRenderInput, ImageRenderOutput>({
    name: IMAGE_RENDER_TOOL_NAME,
    userFacingName: 'ImageRender',
    maxResultSizeChars: 4_000,
    isConcurrencySafe: true, // pure render → idempotent on identical input
    isReadOnly: false,
    inputSchema: imageRenderInputSchema,
    outputSchema: imageRenderOutputSchema,
    async description() {
      return 'Render SVG (v1) / Mermaid (v2) source to PNG and save to the workspace image library.'
    },
    async prompt() {
      return imageRenderPrompt()
    },

    renderResult(data) {
      return `✓ Rendered ${data.width}×${data.height} PNG (${data.bytes} bytes) → ${data.file_path}`
    },

    async call(
      input,
      ctx: ToolUseContext,
    ): Promise<ToolResult<ImageRenderOutput>> {
      // ── 1. Render SVG → PNG ──────────────────────────────────────────
      const scale = (input.scale ?? 2) as 1 | 2 | 3
      let rendered
      try {
        rendered = await deps.svgRenderer(input.source, {
          width: input.width,
          scale,
        })
      } catch (e) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: `SVG render failed: ${e instanceof Error ? e.message : String(e)}`,
        }
      }

      if (rendered.png.length > MAX_RENDERED_PNG_BYTES) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_TOO_LARGE,
          message: `Rendered PNG is ${rendered.png.length} bytes; cap is ${MAX_RENDERED_PNG_BYTES}. Lower scale or simplify the SVG.`,
        }
      }

      // ── 2. Compute blob sha (Git blob format: "blob <len>\0<bytes>") ─
      // Storage will recompute, but we need it now to derive the default
      // filename. Cheap to do twice; the deterministic-content invariant
      // means both computations yield the same result.
      const blobShaForFilename = await gitBlobSha(rendered.png)

      // ── 3. Resolve destination path ──────────────────────────────────
      const requestedPath =
        input.save_to ?? `${DEFAULT_ASSETS_PREFIX}${shaPrefixFilename(blobShaForFilename)}`

      const canon = canonicalizePath(requestedPath)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const path = canon.path

      if (!isPathSafe(path)) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: 'save_to must end in .png',
        }
      }

      // ── 4. Persist via storage layer ─────────────────────────────────
      const writeResult = await deps.storage.writeFile({
        workspaceId: ctx.workspaceId,
        path,
        content: rendered.png,
        author: { id: ctx.principalId, type: ctx.principalType },
        // No parent_sha — render is last-write-wins, like upload.
        message: `image_render: ${path} (${rendered.width}×${rendered.height})`,
        content_type: 'image/png',
      })

      // Refresh ReadFileState so a follow-up huozi_edit on the path (rare
      // but legal — e.g. moving the file) doesn't trip NOT_READ_FIRST.
      ctx.readFileState.set(path, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      return {
        kind: 'success',
        data: {
          ok: true,
          file_path: path,
          blob_sha: writeResult.record.blob_sha,
          width: rendered.width,
          height: rendered.height,
          bytes: rendered.png.length,
          content_type: 'image/png',
          commit_sha: writeResult.commit_sha,
        },
      }
    },
  })
}

/**
 * Compute Git blob SHA-1 over bytes: `sha1("blob " + len + "\0" + bytes)`.
 * Used here only to derive the default filename — storage layer
 * computes its own authoritative blob_sha when persisting.
 */
async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const buf = new Uint8Array(header.length + bytes.length)
  buf.set(header, 0)
  buf.set(bytes, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
