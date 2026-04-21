/**
 * huozi_glob — v1.
 *
 * Aligns with SPEC §4.4. Simple-mode impl: linear scan of storage.listFiles
 * with in-JS glob-to-regex matching. Good enough for PoC + single-workspace
 * scale; production workspaces will index paths in D1 for cheaper listing.
 *
 * Output parity with CC:
 *   - Sort by mtime descending (tie-broken by path ascending for determinism)
 *   - Hard-cap at 100 results with `truncated` flag
 *   - Return relative paths (storage already returns workspace-relative)
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { globToRegex } from '../utils/glob.js'
import { canonicalizePath } from '../utils/path.js'

export const GLOB_TOOL_NAME = 'huozi_glob'

const GLOB_DEFAULT_LIMIT = 100

export const globInputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
})

export type GlobInput = z.infer<typeof globInputSchema>

export const globOutputSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  numFiles: z.number().int().nonnegative(),
  filenames: z.array(z.string()),
  truncated: z.boolean(),
})

export type GlobOutput = z.infer<typeof globOutputSchema>

export function globPrompt(): string {
  return `- Fast file pattern matching tool that works with any workspace size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by last-commit time (most recent first)
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, break it into smaller searches and keep patterns specific.`
}

export interface GlobToolDeps {
  storage: StorageBackend
}

export function createGlobTool(deps: GlobToolDeps): Tool<GlobInput, GlobOutput> {
  return buildTool<GlobInput, GlobOutput>({
    name: GLOB_TOOL_NAME,
    userFacingName: 'Glob',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: globInputSchema,
    outputSchema: globOutputSchema,
    async description() {
      return 'Fast file pattern matching tool.'
    },
    async prompt() {
      return globPrompt()
    },
    renderResult(data) {
      if (data.numFiles === 0) return 'No files found'
      const lines = [...data.filenames]
      if (data.truncated) {
        lines.push('(Results are truncated. Consider using a more specific path or pattern.)')
      }
      return lines.join('\n')
    },

    async call(input, ctx): Promise<ToolResult<GlobOutput>> {
      const start = Date.now()

      let prefix = ''
      if (input.path) {
        const canon = canonicalizePath(input.path)
        if (!canon.ok) {
          return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
        }
        prefix = canon.path.endsWith('/') ? canon.path : canon.path + '/'
      }

      const entries = await deps.storage.listFiles(
        ctx.workspaceId,
        { prefix },
        ctx.abortSignal,
      )

      // Glob pattern is interpreted relative to the prefix (workspace or scope
      // root). Strip prefix from each candidate before matching.
      const regex = globToRegex(input.pattern)
      const matched: Array<{ path: string; mtime: number }> = []
      for (const entry of entries) {
        const relative = prefix ? entry.path.slice(prefix.length) : entry.path
        if (regex.test(relative)) {
          matched.push({ path: entry.path, mtime: entry.mtime })
        }
      }

      // Sort by mtime descending; tie-break on path ascending.
      matched.sort((a, b) => {
        if (b.mtime !== a.mtime) return b.mtime - a.mtime
        return a.path.localeCompare(b.path)
      })

      const truncated = matched.length > GLOB_DEFAULT_LIMIT
      const filenames = matched.slice(0, GLOB_DEFAULT_LIMIT).map((m) => m.path)

      return {
        kind: 'success',
        data: {
          durationMs: Date.now() - start,
          numFiles: filenames.length,
          filenames,
          truncated,
        },
      }
    },
  })
}
