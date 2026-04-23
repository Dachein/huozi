/**
 * huozi_list_tree — compact multi-level directory listing.
 *
 * Think `tree -L <max_depth>`, collapsed into a single MCP response.
 *
 * Why this exists vs huozi_glob:
 *   - Glob returns N leaf paths; the Agent has to dedupe prefixes itself,
 *     and for big workspaces that's 2–5k tokens of raw paths.
 *   - list_tree returns a folded view — one row per directory (with
 *     aggregate counts) plus the files at each level up to max_depth.
 *     Typical workspaces compress to <20 rows (~200 tokens).
 *
 * Folders in huozi are implicit: a directory "exists" iff at least one
 * file sits under it. We derive the tree from the leaf-path list rather
 * than maintaining directory state separately.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const LIST_TREE_TOOL_NAME = 'huozi_list_tree'

const DEFAULT_MAX_DEPTH = 2
const MAX_ALLOWED_DEPTH = 10
const MAX_ROWS = 200

export const listTreeInputSchema = z.object({
  prefix: z
    .string()
    .optional()
    .describe(
      'Restrict listing to this subtree (e.g. "blog" or "data/raw"). Omit to list from workspace root.',
    ),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(MAX_ALLOWED_DEPTH)
    .optional()
    .describe(
      `How many levels below the prefix to expand. Default ${DEFAULT_MAX_DEPTH}. Directories beyond this depth appear as aggregate rows.`,
    ),
  include_hidden: z
    .boolean()
    .optional()
    .describe(
      'Include dotfiles such as `.huozi-keep` folder markers. Default false.',
    ),
})

export type ListTreeInput = z.infer<typeof listTreeInputSchema>

const entrySchema = z.object({
  path: z.string(),
  type: z.enum(['dir', 'file']),
  depth: z.number().int().nonnegative(),
  file_count: z.number().int().nonnegative().optional(),
  subdir_count: z.number().int().nonnegative().optional(),
  size: z.number().int().nonnegative().optional(),
  mtime: z.number().int().nonnegative().optional(),
})

export const listTreeOutputSchema = z.object({
  prefix: z.string(),
  max_depth: z.number().int(),
  entries: z.array(entrySchema),
  total_files: z.number().int().nonnegative(),
  total_dirs: z.number().int().nonnegative(),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative(),
})

export type ListTreeOutput = z.infer<typeof listTreeOutputSchema>

export function listTreePrompt(): string {
  return `- Compact directory-tree listing for the workspace (or a subtree).
- Preferred over huozi_glob when you want to survey structure rather than enumerate every file — returns one row per directory (with file/subdir counts) plus files up to \`max_depth\`.
- Default \`max_depth\` is 2. Pass a larger value to dive deeper; pass a \`prefix\` to restrict the listing.
- Folders in huozi are implicit (derived from file paths). Empty directories do not exist and will not appear.
- For larger workspaces, prefer this over listing raw paths — typically ~10× cheaper in tokens.`
}

export interface ListTreeToolDeps {
  storage: StorageBackend
}

interface DirAgg {
  /** Path relative to workspace root, always ending with "/". */
  path: string
  depth: number
  files: Array<{ name: string; size: number; mtime: number }>
  subdirs: Map<string, DirAgg>
  /** Total file count under this dir at any depth. */
  totalFiles: number
}

export function createListTreeTool(
  deps: ListTreeToolDeps,
): Tool<ListTreeInput, ListTreeOutput> {
  return buildTool<ListTreeInput, ListTreeOutput>({
    name: LIST_TREE_TOOL_NAME,
    userFacingName: 'ListTree',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: listTreeInputSchema,
    outputSchema: listTreeOutputSchema,
    async description() {
      return 'Compact multi-level directory listing.'
    },
    async prompt() {
      return listTreePrompt()
    },
    renderResult(data) {
      if (data.total_files === 0) {
        return data.prefix
          ? `No files under "${data.prefix}".`
          : 'Workspace is empty.'
      }
      const lines: string[] = []
      const header = data.prefix
        ? `${data.prefix}  (${data.total_files} files${data.total_dirs ? `, ${data.total_dirs} dirs` : ''})`
        : `/  (${data.total_files} files${data.total_dirs ? `, ${data.total_dirs} dirs` : ''})`
      lines.push(header)
      for (const e of data.entries) {
        const indent = '  '.repeat(Math.max(0, e.depth))
        if (e.type === 'dir') {
          const tag =
            e.file_count !== undefined
              ? ` (${e.file_count} file${e.file_count === 1 ? '' : 's'}${
                  e.subdir_count ? `, ${e.subdir_count} subdir${e.subdir_count === 1 ? '' : 's'}` : ''
                })`
              : ''
          // Keep only the leaf name for visual clarity.
          const leaf = e.path.replace(/\/$/, '').split('/').pop() ?? e.path
          lines.push(`${indent}${leaf}/${tag}`)
        } else {
          const leaf = e.path.split('/').pop() ?? e.path
          lines.push(`${indent}${leaf}`)
        }
      }
      if (data.truncated) {
        lines.push(
          `(truncated: expand max_depth or narrow prefix to see more — ${data.total_files} files total)`,
        )
      }
      return lines.join('\n')
    },

    async call(input, ctx): Promise<ToolResult<ListTreeOutput>> {
      const start = Date.now()

      let normalizedPrefix = ''
      if (input.prefix && input.prefix.trim() !== '' && input.prefix !== '/') {
        const canon = canonicalizePath(input.prefix)
        if (!canon.ok) {
          return {
            kind: 'error',
            errorCode: ERR.INVALID_URI,
            message: canon.message,
          }
        }
        normalizedPrefix = canon.path.endsWith('/')
          ? canon.path
          : canon.path + '/'
      }

      const maxDepth = input.max_depth ?? DEFAULT_MAX_DEPTH

      const entries = await deps.storage.listFiles(
        ctx.workspaceId,
        { prefix: normalizedPrefix },
        ctx.abortSignal,
      )

      // Build the directory aggregate by inserting each file into a trie.
      const root: DirAgg = {
        path: normalizedPrefix,
        depth: 0,
        files: [],
        subdirs: new Map(),
        totalFiles: 0,
      }

      let totalFiles = 0
      let totalDirs = 0
      const includeHidden = input.include_hidden ?? false

      for (const entry of entries) {
        if (!includeHidden) {
          const leaf = entry.path.split('/').pop() ?? entry.path
          if (leaf.startsWith('.')) continue
        }
        totalFiles++
        // Relative to normalizedPrefix.
        const relative = normalizedPrefix
          ? entry.path.slice(normalizedPrefix.length)
          : entry.path
        const parts = relative.split('/').filter((p) => p.length > 0)
        if (parts.length === 0) continue // shouldn't happen — a file can't be the dir itself
        const fileName = parts[parts.length - 1]!
        let cursor = root
        cursor.totalFiles++
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i]!
          let child = cursor.subdirs.get(dirName)
          if (!child) {
            totalDirs++
            child = {
              path: cursor.path + dirName + '/',
              depth: cursor.depth + 1,
              files: [],
              subdirs: new Map(),
              totalFiles: 0,
            }
            cursor.subdirs.set(dirName, child)
          }
          child.totalFiles++
          cursor = child
        }
        cursor.files.push({
          name: fileName,
          size: entry.size,
          mtime: entry.mtime,
        })
      }

      // Walk the trie DFS into the output row list, stopping at max_depth.
      const out: z.infer<typeof entrySchema>[] = []
      let truncated = false

      function walk(dir: DirAgg) {
        if (dir.depth >= maxDepth) {
          // Too deep — represent the dir itself but don't descend further.
          return
        }
        // Stable order: dirs (alpha) first, then files (alpha).
        const subdirNames = [...dir.subdirs.keys()].sort()
        for (const name of subdirNames) {
          if (out.length >= MAX_ROWS) {
            truncated = true
            return
          }
          const child = dir.subdirs.get(name)!
          out.push({
            path: child.path,
            type: 'dir',
            depth: child.depth - 1, // render indent is relative to prefix root
            file_count: child.totalFiles,
            subdir_count: child.subdirs.size,
          })
          walk(child)
        }
        const files = [...dir.files].sort((a, b) => a.name.localeCompare(b.name))
        for (const f of files) {
          if (out.length >= MAX_ROWS) {
            truncated = true
            return
          }
          out.push({
            path: dir.path + f.name,
            type: 'file',
            depth: dir.depth,
            size: f.size,
            mtime: f.mtime,
          })
        }
      }
      walk(root)

      return {
        kind: 'success',
        data: {
          prefix: normalizedPrefix || '/',
          max_depth: maxDepth,
          entries: out,
          total_files: totalFiles,
          total_dirs: totalDirs,
          truncated,
          durationMs: Date.now() - start,
        },
      }
    },
  })
}
