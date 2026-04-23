/**
 * huozi_mkdir — create an empty folder.
 *
 * Folders in huozi are implicit (path prefixes derived from file paths),
 * so "creating a folder" really means writing a marker file to force the
 * prefix into existence. We follow the gitkeep convention — an empty
 * file named `.huozi-keep` — and list_tree / glob hide `.huozi-keep` by
 * default so the user just sees an empty folder.
 *
 * The Agent-facing command vocabulary (`mkdir`, `rm`, `mv`) is
 * deliberately kept familiar; the implementation simply binds it to
 * content-addressed operations.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const MKDIR_TOOL_NAME = 'huozi_mkdir'

/** The marker file that props up an otherwise-empty folder. */
export const KEEP_FILENAME = '.huozi-keep'

export const mkdirInputSchema = z.object({
  path: z
    .string()
    .describe(
      'Folder path relative to the workspace root, e.g. "blog" or "data/raw". Trailing slash optional.',
    ),
})

export type MkdirInput = z.infer<typeof mkdirInputSchema>

export const mkdirOutputSchema = z.object({
  path: z.string(),
  created: z.boolean(),
  commit_sha: z.string().nullable(),
})

export type MkdirOutput = z.infer<typeof mkdirOutputSchema>

export interface MkdirToolDeps {
  storage: StorageBackend
}

export function mkdirPrompt(): string {
  return `- Create an empty folder at the given path.
- Folders in huozi are implicit — they "exist" when a file is under them. This tool writes a hidden \`.huozi-keep\` marker so the folder shows up in listings.
- Idempotent: calling it on a folder that already has files returns \`created: false\` without touching anything.
- You almost never need this directly. Writing any file at \`foo/bar.md\` already creates \`foo/\`.  Use \`huozi_mkdir\` only when you want to reserve an empty folder name or when the user explicitly asks for one.`
}

export function createMkdirTool(
  deps: MkdirToolDeps,
): Tool<MkdirInput, MkdirOutput> {
  return buildTool<MkdirInput, MkdirOutput>({
    name: MKDIR_TOOL_NAME,
    userFacingName: 'Mkdir',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: mkdirInputSchema,
    outputSchema: mkdirOutputSchema,
    async description() {
      return 'Create an empty folder (via a hidden .huozi-keep marker).'
    },
    async prompt() {
      return mkdirPrompt()
    },
    renderResult(data) {
      if (!data.created) return `Folder "${data.path}" already exists.`
      return `✓ Created folder "${data.path}".`
    },

    async call(input, ctx): Promise<ToolResult<MkdirOutput>> {
      const canon = canonicalizePath(input.path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      // Normalize to folder form and write `<folder>/.huozi-keep`.
      const folder = canon.path.replace(/\/$/, '')
      if (folder.length === 0) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: 'Cannot mkdir the workspace root.',
        }
      }
      const markerPath = `${folder}/${KEEP_FILENAME}`

      // Idempotency check: if anything already lives under this prefix we
      // report "already exists" rather than writing another marker.
      const existing = await deps.storage.listFiles(
        ctx.workspaceId,
        { prefix: folder + '/' },
        ctx.abortSignal,
      )
      if (existing.length > 0) {
        return {
          kind: 'success',
          data: {
            path: folder + '/',
            created: false,
            commit_sha: null,
          },
        }
      }

      try {
        const res = await deps.storage.writeFile({
          workspaceId: ctx.workspaceId,
          path: markerPath,
          content: new Uint8Array(0),
          author: { id: ctx.principalId, type: ctx.principalType },
          parent_sha: null,
          message: `mkdir: ${folder}/`,
          signal: ctx.abortSignal,
        })
        return {
          kind: 'success',
          data: {
            path: folder + '/',
            created: true,
            commit_sha: res.commit_sha,
          },
        }
      } catch (err) {
        return {
          kind: 'error',
          errorCode: ERR.INTERNAL,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    },
  })
}
