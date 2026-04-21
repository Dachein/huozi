/**
 * huozi_history — huozi extension (SPEC §4.7).
 *
 * Read-only view over the commit log. Equivalent concept to Dropbox
 * `dropbox_get_revisions` / OneDrive `get_item_versions` / Box versions —
 * but goes through Git-like commits and returns richer per-commit metadata
 * (author, operation, additions/deletions).
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const HISTORY_TOOL_NAME = 'huozi_history'

export const historyInputSchema = z.object({
  file_path: z.string(),
  limit: z.number().int().positive().max(100).optional(),
  before: z.string().optional(),
})

export type HistoryInput = z.infer<typeof historyInputSchema>

const authorSchema = z.object({
  id: z.string(),
  type: z.enum(['agent', 'user', 'system']),
})

const historyEntrySchema = z.object({
  commit_sha: z.string(),
  parent_sha: z.string().nullable(),
  author: authorSchema,
  timestamp: z.number(),
  message: z.string(),
  operation: z.enum(['create', 'edit', 'write', 'delete', 'batch', 'revert']),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
})

export const historyOutputSchema = z.object({
  history: z.array(historyEntrySchema),
  has_more: z.boolean(),
  next_before: z.string().optional(),
})

export type HistoryOutput = z.infer<typeof historyOutputSchema>

function historyPrompt(): string {
  return `Query the change history for a specific file.

Usage:
- Returns commits (newest first) that touched the given file.
- Each entry includes author, timestamp, operation (create/edit/write/batch/...), and line-change counts.
- Use \`limit\` to cap results (default 20, max 100).
- Use \`before\` (a commit_sha) to paginate — fetch older commits than the one you received.
- For reverting, query history to find the target commit_sha; v2 will add huozi_revert.`
}

export interface HistoryToolDeps {
  storage: StorageBackend
}

/**
 * Infer an "operation" label from a commit record by looking at the single
 * path entry that matches the queried file. For batch commits (>1 path), we
 * label it 'batch' regardless of the individual file's op.
 */
function inferOperation(
  commitPathCount: number,
  pathOp: 'create' | 'update' | 'delete',
  message: string,
): 'create' | 'edit' | 'write' | 'delete' | 'batch' | 'revert' {
  // Explicit intent from the tool takes precedence over arity heuristics.
  // huozi_batch_edit always uses a "batch" / "batch_edit" message prefix,
  // even when the resulting commit touched only one path.
  if (message.startsWith('batch')) return 'batch'
  if (commitPathCount > 1) return 'batch'
  if (message.startsWith('revert')) return 'revert'
  if (pathOp === 'delete') return 'delete'
  if (pathOp === 'create') return 'create'
  // `message` is the signal for edit vs write: our EditTool writes
  // "edit: ..." and WriteTool writes "write: ..." / "create: ...".
  if (message.startsWith('edit')) return 'edit'
  return 'write'
}

export function createHistoryTool(
  deps: HistoryToolDeps,
): Tool<HistoryInput, HistoryOutput> {
  return buildTool<HistoryInput, HistoryOutput>({
    name: HISTORY_TOOL_NAME,
    userFacingName: 'History',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: historyInputSchema,
    outputSchema: historyOutputSchema,
    async description() {
      return 'Query the commit history for a file.'
    },
    async prompt() {
      return historyPrompt()
    },

    renderResult(data) {
      if (data.history.length === 0) return 'No history for this file.'
      const lines = data.history.map((h) => {
        const when = new Date(h.timestamp).toISOString()
        return `${h.commit_sha.slice(0, 10)}  ${when}  ${h.author.type}:${h.author.id}  ${h.operation}  +${h.additions}/-${h.deletions}  ${h.message}`
      })
      if (data.has_more) {
        lines.push(`(more available; pass before="${data.next_before}")`)
      }
      return lines.join('\n')
    },

    async call(input, ctx): Promise<ToolResult<HistoryOutput>> {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const path = canon.path

      const { commits, has_more, next_before } = await deps.storage.listCommits(
        ctx.workspaceId,
        {
          file_path: path,
          limit: input.limit,
          before: input.before,
        },
        ctx.abortSignal,
      )

      const history = commits.map((c) => {
        const pathEntry = c.paths.find((p) => p.path === path)
        const pathOp = pathEntry?.operation ?? 'update'
        const operation = inferOperation(c.paths.length, pathOp, c.message)
        return {
          commit_sha: c.commit_sha,
          parent_sha: c.parent_sha,
          author: { id: c.author.id, type: c.author.type },
          timestamp: c.timestamp,
          message: c.message,
          operation,
          additions: pathEntry?.additions ?? 0,
          deletions: pathEntry?.deletions ?? 0,
        }
      })

      return {
        kind: 'success',
        data: {
          history,
          has_more,
          ...(next_before ? { next_before } : {}),
        },
      }
    },
  })
}
