/**
 * huozi_open — huozi extension.
 *
 * Mints a short-lived URL that renders a single file in any web context
 * (miniapp web-view, iframe embed, future mobile viewer) without
 * publishing the file. Sister to `huozi_share`, but:
 *
 *   - No D1 row, no slug — the URL is a signed JWT path segment.
 *   - Default TTL 10 minutes (cap 1 hour). Past exp the URL 404s.
 *   - Not indexed (the renderer emits noindex/nofollow), not listed in
 *     the workspace shares page, not surfaced as an OpenGraph card.
 *   - Read-only: the URL grants "render this one file", plus read of
 *     any sibling data files that file declares via
 *     `<meta huozi:share-include>` (so data-driven dashboards resolve
 *     their jsonl/csv sources). No writes, no other paths, no other ops.
 *
 * Use `huozi_share` when the intent is "publish for others to see"
 * (KV-persisted, recoverable slug, OG card, indexable). Use
 * `huozi_open` when the intent is "let MY web-view render MY file"
 * (zero persistence, narrow grant, auto-expires).
 *
 * The tool returns the URL only — never the token in isolation — so
 * agent-facing output stays uniform with `huozi_share`'s shape.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import {
  OPEN_TOKEN_DEFAULT_TTL_SECONDS,
  OPEN_TOKEN_MAX_TTL_SECONDS,
} from '../storage/cloudflare/open-token.js'

export const OPEN_TOOL_NAME = 'huozi_open'

export const openInputSchema = z.object({
  file_path: z.string().describe('Path of the file to open'),
  expires_in_seconds: z
    .number()
    .positive()
    .int()
    .max(OPEN_TOKEN_MAX_TTL_SECONDS)
    .optional()
    .describe(
      `Optional TTL in seconds (max ${OPEN_TOKEN_MAX_TTL_SECONDS}). Default ${OPEN_TOKEN_DEFAULT_TTL_SECONDS}.`,
    ),
})

export type OpenInput = z.infer<typeof openInputSchema>

export const openOutputSchema = z.object({
  ok: z.literal(true),
  url: z.string(),
  file_path: z.string(),
  expires_at: z.number(),
})

export type OpenOutput = z.infer<typeof openOutputSchema>

function openPrompt(): string {
  return `Mint a short-lived URL that renders a single file in a web viewer (miniapp web-view, iframe, mobile preview).

Usage:
- Input \`file_path\` is required — the file must exist in the current workspace.
- Optional \`expires_in_seconds\`: positive integer, max ${OPEN_TOKEN_MAX_TTL_SECONDS}. Default ${OPEN_TOKEN_DEFAULT_TTL_SECONDS} (10 min).
- The URL is **NOT a published share**:
    - not indexed by search engines
    - not listed on the workspace shares page
    - not recoverable after exp (no slug, no KV record)
    - grants render-only access to this file, plus read of any siblings it declares via \`<meta huozi:share-include="a.jsonl,b.csv">\` (data-driven dashboards work)
- Use \`huozi_share\` instead when the intent is to publish for other people to read.

Returns \`{ url, file_path, expires_at }\`. Pass the URL into any web embedder (\`<web-view src>\`, iframe, etc.).`
}

export interface OpenToolDeps {
  /**
   * Verifies the file exists (live blob lookup) and signs the JWT.
   * Implementation lives in the worker entry so this module stays free
   * of Cloudflare bindings.
   *
   * Returns the absolute URL the caller should hand to the embedder, OR
   * a 'file_not_found' / 'invalid_file_path' error.
   */
  mintOpenUrl: (
    principal: {
      workspaceId: string
      principalId: string
      scopePath: string | null
    },
    input: { file_path: string; expires_in_seconds?: number },
  ) => Promise<MintOpenResult>
}

export type MintOpenResult =
  | { ok: true; url: string; file_path: string; expires_at: number }
  | {
      ok: false
      error: 'file_not_found' | 'invalid_file_path' | 'internal'
      message?: string
    }

export function createOpenTool(
  deps: OpenToolDeps,
): Tool<OpenInput, OpenOutput> {
  return buildTool<OpenInput, OpenOutput>({
    name: OPEN_TOOL_NAME,
    userFacingName: 'Open',
    maxResultSizeChars: 4_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: openInputSchema,
    outputSchema: openOutputSchema,
    async description() {
      return 'Mint a short-lived URL that renders a single file in a web viewer.'
    },
    async prompt() {
      return openPrompt()
    },
    renderResult(data) {
      const expIn = Math.max(0, data.expires_at - Math.floor(Date.now() / 1000))
      return `✓ Opened ${data.file_path}\n  ${data.url}\n  expires in ${expIn}s`
    },
    async call(input, ctx: ToolUseContext): Promise<ToolResult<OpenOutput>> {
      const res = await deps.mintOpenUrl(
        {
          workspaceId: ctx.workspaceId,
          principalId: ctx.principalId,
          scopePath: ctx.scopePath,
        },
        {
          file_path: input.file_path,
          expires_in_seconds: input.expires_in_seconds,
        },
      )
      if (!res.ok) {
        return {
          kind: 'error',
          errorCode:
            res.error === 'file_not_found'
              ? ERR.FILE_NOT_FOUND
              : res.error === 'invalid_file_path'
                ? ERR.INVALID_URI
                : ERR.INTERNAL,
          message: res.message ? `${res.error}: ${res.message}` : res.error,
        }
      }
      return {
        kind: 'success',
        data: {
          ok: true,
          url: res.url,
          file_path: res.file_path,
          expires_at: res.expires_at,
        },
      }
    },
  })
}
