/**
 * huozi_grep — v1 simple-mode.
 *
 * Aligns with SPEC §4.5.
 *
 * v1 scope:
 *   - Full regex pattern (single-line; `multiline` flag supported via
 *     JS `/s` flag when requested — v1 doesn't enforce the 5MB/50MB/10s
 *     caps yet; that's layered on when we add the production scan path)
 *   - Flags: -i, -n, -A/-B/-C (context), type, glob, output_mode,
 *            head_limit (default 250, 0 = unlimited), offset
 *   - Default auto-behaviors: --hidden-ish (no dot-prefix skipping in v1
 *     since workspace has no concept of "hidden"), VCS-dir exclusion, single
 *     line cap at 500 chars (matches CC's --max-columns 500)
 *
 * NOT in v1 simple-mode:
 *   - Stream-scan with timeout (we linear-scan in memory)
 *   - Trigram / FTS5 index (v1.1 production path adds these via D1)
 *   - Skipped-files reporting (v1 just obeys head_limit; trimming messages
 *     come later)
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { globToRegex, GREP_TYPE_GLOBS } from '../utils/glob.js'
import { canonicalizePath } from '../utils/path.js'

export const GREP_TOOL_NAME = 'huozi_grep'

const GREP_DEFAULT_HEAD_LIMIT = 250
const VCS_DIRS = new Set(['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'])
const MAX_COLUMNS = 500
/**
 * Skip files bigger than this in v1 simple-mode. SPEC §4.5 caps multiline
 * scans at 5 MB per file; here we apply the same threshold uniformly to
 * keep the PoC linear-scan bounded. Files over the cap are silently omitted
 * — a future iteration adds `skipped_files` reporting per SPEC.
 */
const GREP_MAX_FILE_BYTES = 5 * 1024 * 1024

// ── Schemas ──────────────────────────────────────────────────────────────

// Schema uses plain `.optional()` without defaults so zod Input/Output types
// stay identical (ToolDef<I, O> requires this). The tool impl applies all
// defaults explicitly via `??`.
export const grepInputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  type: z.string().optional(),
  output_mode: z
    .enum(['content', 'files_with_matches', 'count'])
    .optional(),
  '-A': z.number().int().nonnegative().optional(),
  '-B': z.number().int().nonnegative().optional(),
  '-C': z.number().int().nonnegative().optional(),
  context: z.number().int().nonnegative().optional(),
  '-n': z.boolean().optional(),
  '-i': z.boolean().optional(),
  head_limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  multiline: z.boolean().optional(),
})

export type GrepInput = z.infer<typeof grepInputSchema>

export const grepOutputSchema = z.object({
  mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
  numFiles: z.number().int().nonnegative(),
  filenames: z.array(z.string()),
  content: z.string().optional(),
  numLines: z.number().int().nonnegative().optional(),
  numMatches: z.number().int().nonnegative().optional(),
  appliedLimit: z.number().int().nonnegative().optional(),
  appliedOffset: z.number().int().nonnegative().optional(),
})

export type GrepOutput = z.infer<typeof grepOutputSchema>

export function grepPrompt(): string {
  return `A powerful search tool.

Usage:
- Prefer this tool over shelling out to grep/rg.
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+").
- Filter files with the glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust").
- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts.
- Pattern syntax: Uses standard JS regex. Literal braces need escaping.
- Multiline matching: By default patterns match within single lines only. For cross-line patterns, use multiline: true.
- head_limit defaults to 250; pass 0 for unlimited (use sparingly — large result sets waste context).`
}

// ── Tool ─────────────────────────────────────────────────────────────────

export interface GrepToolDeps {
  storage: StorageBackend
}

function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset: number,
): { items: T[]; appliedLimit: number | undefined } {
  if (limit === 0) {
    return { items: items.slice(offset), appliedLimit: undefined }
  }
  const effective = limit ?? GREP_DEFAULT_HEAD_LIMIT
  const sliced = items.slice(offset, offset + effective)
  const truncated = items.length - offset > effective
  return {
    items: sliced,
    appliedLimit: truncated ? effective : undefined,
  }
}

function clampLine(line: string): string {
  return line.length > MAX_COLUMNS
    ? line.slice(0, MAX_COLUMNS) + ' [line truncated]'
    : line
}

function isUnderVcsDir(path: string): boolean {
  for (const seg of path.split('/')) {
    if (VCS_DIRS.has(seg)) return true
  }
  return false
}

/**
 * Extract the longest literal alphanumeric substring from a regex pattern.
 * Used to pre-filter candidate files via FTS5 before doing real regex match.
 *
 * Returns null if no usable literal (<3 chars) — caller falls back to full
 * listFiles scan.
 *
 * Examples:
 *   "log\\w+"                  → "log"
 *   "function\\s+handle\\w+"   → "function"   // longest segment
 *   "[A-Z]{3,}"                → null         // no literal
 *   ".*"                       → null
 *   "hello"                    → "hello"      // plain literal
 */
function extractLiteral(pattern: string): string | null {
  // Split at every regex special char. Any segment that's alphanumeric + _
  // counts as a literal candidate.
  const segments = pattern.split(/[\\.*+?|()[\]{}^$/\s]/)
  let best = ''
  for (const seg of segments) {
    // Trim non-word chars at edges
    const clean = seg.replace(/[^\p{L}\p{N}_]+/gu, '')
    if (clean.length > best.length) best = clean
  }
  return best.length >= 3 ? best : null
}

export function createGrepTool(deps: GrepToolDeps): Tool<GrepInput, GrepOutput> {
  return buildTool<GrepInput, GrepOutput>({
    name: GREP_TOOL_NAME,
    userFacingName: 'Search',
    maxResultSizeChars: 20_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: grepInputSchema,
    outputSchema: grepOutputSchema,
    async description() {
      return 'A powerful search tool.'
    },
    async prompt() {
      return grepPrompt()
    },
    renderResult(data) {
      if (data.mode === 'content') {
        return data.content || 'No matches found'
      }
      if (data.mode === 'count') {
        const total = data.numMatches ?? 0
        return `${data.content ?? ''}\n\nFound ${total} total ${total === 1 ? 'occurrence' : 'occurrences'} across ${data.numFiles} ${data.numFiles === 1 ? 'file' : 'files'}.`
      }
      // files_with_matches
      if (data.numFiles === 0) return 'No files found'
      return `Found ${data.numFiles} ${data.numFiles === 1 ? 'file' : 'files'}\n${data.filenames.join('\n')}`
    },

    async call(input, ctx): Promise<ToolResult<GrepOutput>> {
      // Apply defaults up-front (schema declares them optional; defaults live here).
      const caseInsensitive = input['-i'] ?? false
      const showLineNumbers = input['-n'] ?? true
      const multiline = input.multiline ?? false
      const outputMode =
        input.output_mode ?? ('files_with_matches' as const)
      const offset = input.offset ?? 0

      // Compile regex.
      let re: RegExp
      const flags = (caseInsensitive ? 'i' : '') + (multiline ? 's' : '') + 'g'
      try {
        re = new RegExp(input.pattern, flags)
      } catch (e) {
        return {
          kind: 'error',
          errorCode: 0,
          message: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`,
        }
      }

      // Resolve path prefix (scope).
      let prefix = ''
      if (input.path) {
        const canon = canonicalizePath(input.path)
        if (!canon.ok) {
          return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
        }
        prefix = canon.path.endsWith('/') ? canon.path : canon.path + '/'
      }

      // File glob filters (combine --type + --glob, union semantics).
      const typeGlobs = input.type ? GREP_TYPE_GLOBS[input.type] ?? [] : []
      const userGlobs = input.glob ? [input.glob] : []
      const allowRegexes = [...typeGlobs, ...userGlobs].map((g) =>
        globToRegex(g),
      )
      const pathAllowed = (path: string): boolean => {
        if (isUnderVcsDir(path)) return false
        if (allowRegexes.length === 0) return true
        const rel = prefix ? path.slice(prefix.length) : path
        return allowRegexes.some((r) => r.test(rel))
      }

      // Resolve context flags. -C/context wins over -A/-B.
      let ctxBefore = 0
      let ctxAfter = 0
      if (input.context !== undefined) {
        ctxBefore = ctxAfter = input.context
      } else if (input['-C'] !== undefined) {
        ctxBefore = ctxAfter = input['-C']
      } else {
        if (input['-B'] !== undefined) ctxBefore = input['-B']
        if (input['-A'] !== undefined) ctxAfter = input['-A']
      }

      // Pre-filter via FTS5 when a literal can be extracted from the pattern.
      // This turns "scan every file" (25s on ~50-file workspaces) into "scan
      // only the few files that trigram-match this literal" (~100ms).
      //
      // multiline or trivially-unfilterable patterns fall through to a full
      // listFiles scan — the safety valve is always there.
      const literal = !multiline ? extractLiteral(input.pattern) : null
      let entries: Array<{ path: string; size: number; mtime: number }> = []

      if (literal) {
        try {
          const candidates = await deps.storage.searchFts(
            ctx.workspaceId,
            literal,
            { prefix, limit: 1000 },
            ctx.abortSignal,
          )
          // Need size + mtime for sort / skip-large. Fetch those in one go via
          // listFiles then intersect with candidates.
          const all = await deps.storage.listFiles(
            ctx.workspaceId,
            { prefix },
            ctx.abortSignal,
          )
          const candidateSet = new Set(candidates)
          entries = all.filter((e) => candidateSet.has(e.path))
        } catch {
          // FTS failed — fall through to full scan
          entries = await deps.storage.listFiles(
            ctx.workspaceId,
            { prefix },
            ctx.abortSignal,
          )
        }
      } else {
        entries = await deps.storage.listFiles(
          ctx.workspaceId,
          { prefix },
          ctx.abortSignal,
        )
      }

      // Stream-like scan.
      const decoder = new TextDecoder('utf-8')
      const filenamesWithMatches: string[] = []
      const countsPerFile = new Map<string, number>()
      // Content-mode collects raw "path:lineno:content" / "path-lineno-content" strings
      const contentLines: string[] = []

      for (const entry of entries) {
        if (!pathAllowed(entry.path)) continue
        if (entry.size > GREP_MAX_FILE_BYTES) continue
        const record = await deps.storage.readFile(ctx.workspaceId, entry.path)
        if (!record) continue

        let text: string
        try {
          text = decoder.decode(record.content)
        } catch {
          continue // non-utf8 blob, skip
        }
        const lines = text.split(/\r?\n/)

        if (outputMode === 'content') {
          // Collect context-expanded match lines with line numbers.
          const matchLinesSet = new Set<number>()
          if (multiline) {
            // In multiline mode, find match byte offsets then map back to line.
            re.lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = re.exec(text)) !== null) {
              // Count newlines before match start to get line index.
              const before = text.slice(0, m.index)
              const startLine = (before.match(/\n/g) ?? []).length
              const matched = m[0] ?? ''
              const spannedLines = (matched.match(/\n/g) ?? []).length
              for (let i = 0; i <= spannedLines; i++) {
                matchLinesSet.add(startLine + i)
              }
              if (m.index === re.lastIndex) re.lastIndex++
            }
          } else {
            const lineRe = new RegExp(
              input.pattern,
              (caseInsensitive ? 'i' : '') + (multiline ? 's' : ''),
            )
            for (let i = 0; i < lines.length; i++) {
              if (lineRe.test(lines[i]!)) matchLinesSet.add(i)
            }
          }
          if (matchLinesSet.size === 0) continue

          // Expand each match line with context window.
          const toEmitSet = new Set<number>()
          for (const mi of matchLinesSet) {
            const from = Math.max(0, mi - ctxBefore)
            const to = Math.min(lines.length - 1, mi + ctxAfter)
            for (let i = from; i <= to; i++) toEmitSet.add(i)
          }
          const toEmit = [...toEmitSet].sort((a, b) => a - b)
          for (const i of toEmit) {
            const sep = matchLinesSet.has(i) ? ':' : '-'
            const ln = clampLine(lines[i] ?? '')
            const prefixSep = showLineNumbers ? `${i + 1}${sep}` : ''
            contentLines.push(`${entry.path}${sep}${prefixSep}${ln}`)
          }
        } else {
          // files_with_matches / count modes
          const perFile = countsPerFile.get(entry.path) ?? 0
          let count = perFile
          if (multiline) {
            re.lastIndex = 0
            while (re.exec(text) !== null) {
              count++
            }
          } else {
            const lineRe = new RegExp(
              input.pattern,
              (caseInsensitive ? 'i' : '') + 'g',
            )
            for (const l of lines) {
              const m = l.match(lineRe)
              if (m) count += m.length
            }
          }
          if (count > 0) {
            countsPerFile.set(entry.path, count)
            if (!filenamesWithMatches.includes(entry.path)) {
              filenamesWithMatches.push(entry.path)
            }
          }
        }
      }

      if (outputMode === 'content') {
        const { items, appliedLimit } = applyHeadLimit(
          contentLines,
          input.head_limit,
          offset,
        )
        return {
          kind: 'success',
          data: {
            mode: 'content',
            numFiles: 0,
            filenames: [],
            content: items.join('\n'),
            numLines: items.length,
            ...(appliedLimit !== undefined ? { appliedLimit } : {}),
            ...(offset > 0 ? { appliedOffset: offset } : {}),
          },
        }
      }

      if (outputMode === 'count') {
        const entries: string[] = []
        let totalMatches = 0
        for (const f of filenamesWithMatches) {
          const c = countsPerFile.get(f) ?? 0
          entries.push(`${f}:${c}`)
          totalMatches += c
        }
        const { items, appliedLimit } = applyHeadLimit(
          entries,
          input.head_limit,
          offset,
        )
        return {
          kind: 'success',
          data: {
            mode: 'count',
            numFiles: items.length,
            filenames: [],
            content: items.join('\n'),
            numMatches: totalMatches,
            ...(appliedLimit !== undefined ? { appliedLimit } : {}),
            ...(offset > 0 ? { appliedOffset: offset } : {}),
          },
        }
      }

      // files_with_matches — sort by mtime desc.
      const withMtime = filenamesWithMatches.map((p) => {
        const entry = entries.find((e) => e.path === p)
        return { path: p, mtime: entry?.mtime ?? 0 }
      })
      withMtime.sort((a, b) => {
        if (b.mtime !== a.mtime) return b.mtime - a.mtime
        return a.path.localeCompare(b.path)
      })
      const sorted = withMtime.map((w) => w.path)
      const { items, appliedLimit } = applyHeadLimit(
        sorted,
        input.head_limit,
        offset,
      )
      return {
        kind: 'success',
        data: {
          mode: 'files_with_matches',
          numFiles: items.length,
          filenames: items,
          ...(appliedLimit !== undefined ? { appliedLimit } : {}),
          ...(offset > 0 ? { appliedOffset: offset } : {}),
        },
      }
    },
  })
}
