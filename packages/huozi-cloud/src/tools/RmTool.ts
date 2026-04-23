/**
 * huozi_rm — delete a file or a whole subtree.
 *
 * Safety:
 *   - Deleting a directory requires `recursive: true`; otherwise we
 *     refuse rather than guessing.
 *   - `dry_run: true` returns the list of paths that would be deleted
 *     without touching anything. Agents should use this before wide
 *     deletes; humans will want it through Web UI too.
 *   - Empty workspace-root delete is rejected.
 *
 * Content-addressed semantics: R2 blobs are NOT purged. A deleted file
 * can be recovered from commit history until a future gc pass reaps
 * truly unreachable blobs.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const RM_TOOL_NAME = 'huozi_rm'

export const rmInputSchema = z.object({
  path: z
    .string()
    .describe(
      'File path (e.g. "blog/post.md") or folder prefix (e.g. "drafts/") to remove.',
    ),
  recursive: z
    .boolean()
    .optional()
    .describe(
      'Required to delete a folder (prefix). Default false — single-file deletes only.',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe(
      'If true, report what would be deleted without touching anything. Default false.',
    ),
})

export type RmInput = z.infer<typeof rmInputSchema>

export const rmOutputSchema = z.object({
  path: z.string(),
  mode: z.enum(['file', 'prefix']),
  dry_run: z.boolean(),
  deleted_paths: z.array(z.string()),
  commit_sha: z.string().nullable(),
})

export type RmOutput = z.infer<typeof rmOutputSchema>

export interface RmToolDeps {
  storage: StorageBackend
}

export function rmPrompt(): string {
  return `- Delete a file (default) or a whole folder subtree (pass \`recursive: true\`).
- Set \`dry_run: true\` first on wide deletes to see what will be removed before committing.
- History still contains every removed file; a deleted file can be restored by writing it back with \`huozi_write\`. R2 blobs are kept, not purged.
- To remove an empty folder, you can \`huozi_rm\` its \`.huozi-keep\` marker (or pass \`recursive: true\` on the folder path).`
}

export function createRmTool(deps: RmToolDeps): Tool<RmInput, RmOutput> {
  return buildTool<RmInput, RmOutput>({
    name: RM_TOOL_NAME,
    userFacingName: 'Rm',
    maxResultSizeChars: 50_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: rmInputSchema,
    outputSchema: rmOutputSchema,
    async description() {
      return 'Delete a file or (with recursive=true) a folder subtree.'
    },
    async prompt() {
      return rmPrompt()
    },
    renderResult(data) {
      if (data.dry_run) {
        return `DRY RUN — would delete ${data.deleted_paths.length} file(s):\n${data.deleted_paths
          .map((p) => `  ${p}`)
          .join('\n')}`
      }
      if (data.deleted_paths.length === 0) {
        return `Nothing matched "${data.path}".`
      }
      if (data.mode === 'file') {
        return `✓ Deleted ${data.path}`
      }
      return `✓ Deleted ${data.deleted_paths.length} file(s) under "${data.path}"`
    },

    async call(input, ctx): Promise<ToolResult<RmOutput>> {
      const canon = canonicalizePath(input.path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const recursive = input.recursive ?? false
      const dryRun = input.dry_run ?? false
      const author = { id: ctx.principalId, type: ctx.principalType }

      // Decide single-file vs prefix. If path refers to an existing
      // single file AND recursive is false, go single-file. Otherwise
      // treat as prefix (but require recursive=true for prefix deletes).
      const looksLikeFolder = canon.path.endsWith('/')
      const existingFile = looksLikeFolder
        ? null
        : await deps.storage.readFile(
            ctx.workspaceId,
            canon.path,
            ctx.abortSignal,
          )

      // Early out: non-recursive, path doesn't look like a folder, and
      // the exact file doesn't exist. Report plain "not found" rather
      // than the misleading "looks like a folder" prefix-mode error.
      if (!recursive && !looksLikeFolder && !existingFile) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `File not found: ${canon.path}`,
        }
      }

      if (existingFile && !canon.path.endsWith('/') && !recursive) {
        // Single-file delete.
        if (dryRun) {
          return {
            kind: 'success',
            data: {
              path: canon.path,
              mode: 'file',
              dry_run: true,
              deleted_paths: [canon.path],
              commit_sha: null,
            },
          }
        }
        try {
          const res = await deps.storage.deleteFile({
            workspaceId: ctx.workspaceId,
            path: canon.path,
            author,
            signal: ctx.abortSignal,
          })
          if (!res.ok) {
            return {
              kind: 'error',
              errorCode: ERR.FILE_NOT_FOUND,
              message: `File not found: ${canon.path}`,
            }
          }
          return {
            kind: 'success',
            data: {
              path: canon.path,
              mode: 'file',
              dry_run: false,
              deleted_paths: [canon.path],
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

      // Prefix / recursive delete.
      if (!recursive) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: `"${input.path}" looks like a folder. Pass \`recursive: true\` to delete a folder and all its contents.`,
        }
      }

      // Identify everything under the prefix.
      const prefix = canon.path.endsWith('/') ? canon.path : canon.path + '/'
      const list = await deps.storage.listFiles(
        ctx.workspaceId,
        { prefix },
        ctx.abortSignal,
      )
      const matched = list.map((e) => e.path)

      if (dryRun) {
        return {
          kind: 'success',
          data: {
            path: prefix,
            mode: 'prefix',
            dry_run: true,
            deleted_paths: matched,
            commit_sha: null,
          },
        }
      }

      if (matched.length === 0) {
        return {
          kind: 'success',
          data: {
            path: prefix,
            mode: 'prefix',
            dry_run: false,
            deleted_paths: [],
            commit_sha: null,
          },
        }
      }

      try {
        const res = await deps.storage.deletePrefix({
          workspaceId: ctx.workspaceId,
          prefix,
          author,
          signal: ctx.abortSignal,
        })
        if (!res.ok) {
          return {
            kind: 'error',
            errorCode: ERR.INVALID_URI,
            message: res.message ?? res.error,
          }
        }
        return {
          kind: 'success',
          data: {
            path: prefix,
            mode: 'prefix',
            dry_run: false,
            deleted_paths: res.deleted_paths,
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
