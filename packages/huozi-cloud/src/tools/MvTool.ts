/**
 * huozi_mv — rename / move a file or a whole subtree.
 *
 * Content-addressed: no R2 I/O — only D1 path metadata changes. Rename
 * of 1,000 files is essentially a single commit.
 *
 * Semantics mirror Unix `mv`:
 *   - Single file → single file: `huozi_mv("a.md", "b.md")`
 *   - Folder → folder (same prefix replace): `huozi_mv("drafts/", "blog/")`
 *
 * History encoding: one commit with paired `delete(old)` +
 * `create(new)` entries. UIs can detect the pair and render
 * "renamed A → B" without a new operation kind in the schema.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const MV_TOOL_NAME = 'huozi_mv'

export const mvInputSchema = z.object({
  from: z.string().describe('Source path. File like "a.md" or folder like "old/".'),
  to: z
    .string()
    .describe(
      'Destination path. Must match the shape of `from` (both files, or both folders).',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe(
      'If true, return what would be moved without touching anything. Default false.',
    ),
})

export type MvInput = z.infer<typeof mvInputSchema>

export const mvOutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  mode: z.enum(['file', 'prefix']),
  dry_run: z.boolean(),
  moved_paths: z.array(z.object({ from: z.string(), to: z.string() })),
  commit_sha: z.string().nullable(),
})

export type MvOutput = z.infer<typeof mvOutputSchema>

export interface MvToolDeps {
  storage: StorageBackend
}

export function mvPrompt(): string {
  return `- Rename or move a file or an entire folder subtree.
- Cheap: content-addressed, so moving 1,000 files under a folder is a single commit with zero blob I/O.
- Shape must match: both ends files ("a.md" → "b.md") OR both ends folders ("old/" → "new/").
- \`dry_run: true\` shows what would move. Use it before wide folder renames.
- If the target path already exists, the move fails — delete or pick a different name first.`
}

export function createMvTool(deps: MvToolDeps): Tool<MvInput, MvOutput> {
  return buildTool<MvInput, MvOutput>({
    name: MV_TOOL_NAME,
    userFacingName: 'Mv',
    maxResultSizeChars: 50_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: mvInputSchema,
    outputSchema: mvOutputSchema,
    async description() {
      return 'Rename / move a file or folder.'
    },
    async prompt() {
      return mvPrompt()
    },
    renderResult(data) {
      if (data.dry_run) {
        const preview = data.moved_paths
          .slice(0, 10)
          .map((p) => `  ${p.from} → ${p.to}`)
          .join('\n')
        const more =
          data.moved_paths.length > 10
            ? `\n  … ${data.moved_paths.length - 10} more`
            : ''
        return `DRY RUN — would move ${data.moved_paths.length} path(s):\n${preview}${more}`
      }
      if (data.moved_paths.length === 0) {
        return `Nothing matched "${data.from}".`
      }
      if (data.mode === 'file') {
        return `✓ Renamed ${data.from} → ${data.to}`
      }
      return `✓ Moved ${data.moved_paths.length} file(s): ${data.from} → ${data.to}`
    },

    async call(input, ctx): Promise<ToolResult<MvOutput>> {
      const fromCanon = canonicalizePath(input.from)
      const toCanon = canonicalizePath(input.to)
      if (!fromCanon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: fromCanon.message,
        }
      }
      if (!toCanon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: toCanon.message,
        }
      }

      const fromIsFolder =
        fromCanon.path.endsWith('/') || input.from.endsWith('/')
      const toIsFolder = toCanon.path.endsWith('/') || input.to.endsWith('/')
      const author = { id: ctx.principalId, type: ctx.principalType }

      if (fromIsFolder !== toIsFolder) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message:
            '`from` and `to` must match shape: both file paths, or both folder paths (with trailing slash).',
        }
      }

      if (!fromIsFolder) {
        // Single-file rename.
        if (input.dry_run) {
          const existing = await deps.storage.readFile(
            ctx.workspaceId,
            fromCanon.path,
            ctx.abortSignal,
          )
          if (!existing) {
            return {
              kind: 'error',
              errorCode: ERR.FILE_NOT_FOUND,
              message: `File not found: ${fromCanon.path}`,
            }
          }
          return {
            kind: 'success',
            data: {
              from: fromCanon.path,
              to: toCanon.path,
              mode: 'file',
              dry_run: true,
              moved_paths: [{ from: fromCanon.path, to: toCanon.path }],
              commit_sha: null,
            },
          }
        }
        try {
          const res = await deps.storage.renamePath({
            workspaceId: ctx.workspaceId,
            from: fromCanon.path,
            to: toCanon.path,
            author,
            signal: ctx.abortSignal,
          })
          if (!res.ok) {
            return {
              kind: 'error',
              errorCode:
                res.error === 'not_found'
                  ? ERR.FILE_NOT_FOUND
                  : res.error === 'target_exists'
                    ? ERR.CANNOT_CREATE_FILE_EXISTS
                    : ERR.INVALID_URI,
              message: res.message ?? res.error,
            }
          }
          return {
            kind: 'success',
            data: {
              from: res.from,
              to: res.to,
              mode: 'file',
              dry_run: false,
              moved_paths: [{ from: res.from, to: res.to }],
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
      }

      // Prefix rename.
      const fromPrefix = fromCanon.path.endsWith('/')
        ? fromCanon.path
        : fromCanon.path + '/'
      const toPrefix = toCanon.path.endsWith('/')
        ? toCanon.path
        : toCanon.path + '/'

      if (input.dry_run) {
        const list = await deps.storage.listFiles(
          ctx.workspaceId,
          { prefix: fromPrefix },
          ctx.abortSignal,
        )
        const pairs = list.map((e) => ({
          from: e.path,
          to: toPrefix + e.path.slice(fromPrefix.length),
        }))
        return {
          kind: 'success',
          data: {
            from: fromPrefix,
            to: toPrefix,
            mode: 'prefix',
            dry_run: true,
            moved_paths: pairs,
            commit_sha: null,
          },
        }
      }

      try {
        const res = await deps.storage.renamePrefix({
          workspaceId: ctx.workspaceId,
          fromPrefix,
          toPrefix,
          author,
          signal: ctx.abortSignal,
        })
        if (!res.ok) {
          return {
            kind: 'error',
            errorCode:
              res.error === 'target_exists'
                ? ERR.CANNOT_CREATE_FILE_EXISTS
                : ERR.INVALID_URI,
            message: res.message ?? res.error,
          }
        }
        return {
          kind: 'success',
          data: {
            from: res.from_prefix,
            to: res.to_prefix,
            mode: 'prefix',
            dry_run: false,
            moved_paths: res.moved_paths,
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
