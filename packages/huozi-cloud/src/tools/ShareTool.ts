/**
 * huozi_share — huozi extension.
 *
 * Agent-facing wrapper around the share-creation flow. Lets an Agent
 * publish a file as `huozi.app/p/<slug>` without going through the
 * web UI. Semantics:
 *
 *   - Live-mode: the URL always serves the CURRENT bytes at the share's
 *     file_path, not a frozen snapshot. Later edits to the file show
 *     up on the URL automatically. Deleting the file makes the URL
 *     return file_no_longer_exists.
 *   - Slug is ALWAYS server-generated — a 10-char random string. The
 *     custom-slug path was removed so Web and Agent surfaces produce
 *     identical URL shapes.
 *   - `passcode` is optional. If provided, it must be exactly 6 digits.
 *     Visitors without the passcode see a locked shell; with it, they
 *     see the file.
 *
 * The tool deliberately does NOT return the Agent's api_key or any
 * secret — the `url` is what the Agent prints to the human.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import type {
  CreateShareInput,
  CreateShareResult,
} from '../storage/cloudflare/shares.js'

export const SHARE_TOOL_NAME = 'huozi_share'

export const shareInputSchema = z.object({
  file_path: z.string().describe('Path of the file to publish'),
  passcode: z
    .string()
    .optional()
    .describe('Optional 6-digit passcode. Omit for a fully public share.'),
  expires_in_seconds: z
    .number()
    .positive()
    .int()
    .optional()
    .describe(
      'Optional TTL in seconds. Link becomes not-found after this many seconds. Omit for a permanent link.',
    ),
})

export type ShareInput = z.infer<typeof shareInputSchema>

export const shareOutputSchema = z.object({
  ok: z.literal(true),
  url: z.string(),
  slug: z.string(),
  file_path: z.string(),
  has_passcode: z.boolean(),
  passcode: z.string().optional(),
  blob_sha: z.string(),
  commit_sha: z.string().nullable(),
  created_at: z.number(),
  expires_at: z.number().nullable(),
})

export type ShareOutput = z.infer<typeof shareOutputSchema>

function sharePrompt(): string {
  return `Publish a file as a public huozi.app/p/<random> URL.

Usage:
- Input \`file_path\` is required — the file must exist in the current workspace.
- Optional \`passcode\`: exactly 6 digits. Visitors need to enter it to see the file.
- Optional \`expires_in_seconds\`: positive integer. After that many seconds the link returns not-found. Omit for a permanent link.
- Slugs are always server-generated (10-char random). There is no custom-slug option — the URL shape is uniform across Web and Agent callers.
- Live-mode: the URL tracks the file. Editing the file updates what visitors see. Deleting the file returns \`file_no_longer_exists\`.
- To remove a share, call the owner revoke endpoint or use the /workspace/shares page.`
}

export interface ShareToolDeps {
  /**
   * Creator function supplied by the worker entry. Gives us a seam that
   * holds the Cloudflare env without bleeding Worker types into this
   * module.
   */
  createShare: (
    principal: {
      workspaceId: string
      principalId: string
      scopePath: string | null
    },
    input: CreateShareInput,
  ) => Promise<CreateShareResult>
  /**
   * Base URL where the share is browsable. `/p/<slug>` is appended. Must
   * include scheme. Default: `https://huozi.app`.
   */
  publicBase?: string
}

export function createShareTool(
  deps: ShareToolDeps,
): Tool<ShareInput, ShareOutput> {
  const base = deps.publicBase ?? 'https://huozi.app'

  return buildTool<ShareInput, ShareOutput>({
    name: SHARE_TOOL_NAME,
    userFacingName: 'Share',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: true,
    isReadOnly: false,
    inputSchema: shareInputSchema,
    outputSchema: shareOutputSchema,
    async description() {
      return 'Publish a file to a shareable huozi.app/p/<slug> URL.'
    },
    async prompt() {
      return sharePrompt()
    },

    renderResult(data) {
      const lines = [
        `✓ Published ${data.file_path}`,
        `  ${data.url}`,
      ]
      if (data.has_passcode && data.passcode) {
        lines.push(`  passcode: ${data.passcode}`)
      }
      return lines.join('\n')
    },

    async call(input, ctx: ToolUseContext): Promise<ToolResult<ShareOutput>> {
      const res = await deps.createShare(
        {
          workspaceId: ctx.workspaceId,
          principalId: ctx.principalId,
          scopePath: ctx.scopePath,
        },
        {
          file_path: input.file_path,
          passcode: input.passcode,
          expires_in_seconds: input.expires_in_seconds,
        },
      )

      if (!res.ok) {
        return {
          kind: 'error',
          errorCode:
            res.error === 'file_not_found'
              ? ERR.FILE_NOT_FOUND
              : res.error === 'invalid_file_path' ||
                  res.error === 'invalid_passcode' ||
                  res.error === 'invalid_ttl'
                ? ERR.INVALID_URI
                : ERR.INTERNAL,
          message: res.message
            ? `${res.error}: ${res.message}`
            : res.error,
        }
      }

      return {
        kind: 'success',
        data: {
          ok: true,
          url: `${base}/p/${res.slug}`,
          slug: res.slug,
          file_path: res.file_path,
          has_passcode: res.has_passcode,
          // When the caller supplied their own passcode we echo it back
          // so the Agent can display it to the human in the same turn
          // (critical: the system never stores or re-derives it from
          // the hash later). When auto-generated, we don't mint one.
          ...(res.has_passcode && input.passcode
            ? { passcode: input.passcode }
            : {}),
          blob_sha: res.blob_sha,
          commit_sha: res.commit_sha,
          created_at: res.created_at,
          expires_at: res.expires_at,
        },
      }
    },
  })
}
