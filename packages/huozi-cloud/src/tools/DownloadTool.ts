/**
 * huozi_download — symmetric counterpart to huozi_upload.
 *
 * Why this exists alongside huozi_read:
 *   - huozi_read is the agent's "read into context" path: small text inline,
 *     small binary as base64, big binary as binary_ref. The decision tree
 *     is shaped around the agent consuming bytes IN.
 *   - huozi_download is the agent's "give me a URL the human / external
 *     pipeline can fetch" path. It always returns a signed URL, regardless
 *     of file size. Cheap to call, no body bytes round-trip through the
 *     model's context.
 *
 * Output is exactly what an agent should hand to the human in a chat:
 * `{ url, expires_at }` plus enough metadata (size, content_type) to render
 * a "Download X.pdf (2.3 MB)" link.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'
import type { BinaryRefSigner } from './ReadTool/ReadTool.js'
import { guessMime } from './ReadTool/mime.js'

export const DOWNLOAD_TOOL_NAME = 'huozi_download'

export const downloadInputSchema = z.object({
  file_path: z
    .string()
    .describe('Workspace-relative path of the file to mint a download URL for.'),
  ttl_seconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24)
    .optional()
    .describe(
      'How long the URL stays valid. Default 1200 (20 min); cap 86400 (24h).',
    ),
})

export type DownloadInput = z.infer<typeof downloadInputSchema>

export const downloadOutputSchema = z.object({
  ok: z.literal(true),
  file_path: z.string(),
  url: z.string(),
  expires_at: z.number(),
  size: z.number(),
  blob_sha: z.string(),
  content_type: z.string(),
})

export type DownloadOutput = z.infer<typeof downloadOutputSchema>

export interface DownloadToolDeps {
  storage: StorageBackend
  /**
   * Required. If the deployment hasn't configured a signing secret, the
   * tool itself shouldn't be registered — surfacing this as "always
   * available but errors at call-time" is worse than the absence in
   * tools/list. The worker entry omits it when sign is null.
   */
  signer: BinaryRefSigner
}

export function downloadPrompt(): string {
  return `Mint a short-lived signed URL to download a file's bytes.

Usage:
- For text files an agent will read INTO its context, prefer huozi_read — it returns the bytes directly.
- For files the human will download (PDF, image, audio, zip, office), or for piping into an external tool, ${DOWNLOAD_TOOL_NAME} is the right call. The URL works in any HTTP client and renders inline in a browser.
- The URL stays valid for ${20 * 60} seconds by default; pass ttl_seconds to override (cap 24 h).
- The URL embeds a per-call HMAC signature; rotating HUOZI_SIGNING_SECRET on the server invalidates all outstanding URLs.`
}

export function createDownloadTool(
  deps: DownloadToolDeps,
): Tool<DownloadInput, DownloadOutput> {
  return buildTool<DownloadInput, DownloadOutput>({
    name: DOWNLOAD_TOOL_NAME,
    userFacingName: 'Download',
    maxResultSizeChars: 4_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: downloadInputSchema,
    outputSchema: downloadOutputSchema,
    async description() {
      return 'Mint a short-lived signed URL to download a file from the workspace.'
    },
    async prompt() {
      return downloadPrompt()
    },

    renderResult(data) {
      return `Download URL (expires ${new Date(data.expires_at).toISOString()}):\n${data.url}`
    },

    async call(
      input,
      ctx: ToolUseContext,
    ): Promise<ToolResult<DownloadOutput>> {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const path = canon.path

      const record = await deps.storage.readFile(ctx.workspaceId, path)
      if (!record) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `File not found: ${path}`,
        }
      }

      const signed = await deps.signer.signUrl({
        workspaceId: ctx.workspaceId,
        path,
        blob_sha: record.blob_sha,
        ttlSeconds: input.ttl_seconds ?? 20 * 60,
      })

      return {
        kind: 'success',
        data: {
          ok: true,
          file_path: path,
          url: signed.url,
          expires_at: signed.expiresAt,
          size: record.size,
          blob_sha: record.blob_sha,
          // Prefer the explicit content_type recorded at upload time;
          // fall back to extension-based guess for legacy text rows.
          content_type: record.content_type ?? guessMime(path),
        },
      }
    },
  })
}
