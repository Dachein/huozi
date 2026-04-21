/**
 * Diff / patch utilities.
 *
 * Ported from: cc:utils/diff.ts
 *
 * Changes from CC:
 *   - Removed analytics (logEvent / tengu_file_changed) — pure function now
 *   - Removed cost-tracker / LocCounter integrations — return counters instead
 *   - Inlined `count` and `convertLeadingTabsToSpaces` from ./internal
 *   - Removed FileEdit type import (defined locally as minimal shape)
 *
 * The `escapeForDiff` trick (`&` → token, `$` → token) is KEPT AS-IS —
 * the `diff` npm package has known bugs with those characters. Do not remove.
 */

import { structuredPatch } from 'diff'
import { convertLeadingTabsToSpaces, count } from './internal.js'

/**
 * Shape of one hunk in a structured patch. The `diff` npm package's types
 * changed across versions; we define our own stable shape (identical to CC's)
 * and cast the library output to it. This is the canonical type used across
 * huozi-cloud for diff hunks.
 */
export interface StructuredPatchHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export const CONTEXT_LINES = 3
export const DIFF_TIMEOUT_MS = 5_000

/** Minimal edit shape compatible with cc:FileEditTool/types.ts `FileEdit`. */
export interface FileEdit {
  old_string: string
  new_string: string
  replace_all: boolean
}

/**
 * Shifts hunk line numbers by offset. Use when `getPatchForDisplay` received
 * a slice of the file rather than the whole file — callers pass
 * `sliceStartLine - 1` to convert slice-relative to file-relative.
 */
export function adjustHunkLineNumbers(
  hunks: StructuredPatchHunk[],
  offset: number,
): StructuredPatchHunk[] {
  if (offset === 0) return hunks
  return hunks.map((h) => ({
    ...h,
    oldStart: h.oldStart + offset,
    newStart: h.newStart + offset,
  }))
}

// `&` confuses the diff library in some code paths; replace with a
// null-byte-sentinel during diff, then restore afterwards. Same story for `$`.
const AMPERSAND_TOKEN = '<<:AMPERSAND_TOKEN:>>'
const DOLLAR_TOKEN = '<<:DOLLAR_TOKEN:>>'

function escapeForDiff(s: string): string {
  return s.replaceAll('&', AMPERSAND_TOKEN).replaceAll('$', DOLLAR_TOKEN)
}
function unescapeFromDiff(s: string): string {
  return s.replaceAll(AMPERSAND_TOKEN, '&').replaceAll(DOLLAR_TOKEN, '$')
}

export interface LineChangeCounts {
  additions: number
  removals: number
}

/**
 * Count lines added/removed in a patch.
 * For new files (empty patch), pass `newFileContent` to get full-file count.
 *
 * Pure function — no analytics side effects. Caller decides what to do with
 * the numbers (log, bill, report to Agent, etc).
 */
export function countLinesChanged(
  patch: StructuredPatchHunk[],
  newFileContent?: string,
): LineChangeCounts {
  if (patch.length === 0 && newFileContent) {
    return {
      additions: newFileContent.split(/\r?\n/).length,
      removals: 0,
    }
  }
  return {
    additions: patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, (ln) => ln.startsWith('+')),
      0,
    ),
    removals: patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, (ln) => ln.startsWith('-')),
      0,
    ),
  }
}

/**
 * Compute a structured diff between two file contents.
 *
 * `singleHunk: true` forces the entire diff into one hunk (useful for "render
 * whole file as diff" in UIs). Default 3 context lines on each side.
 */
export function getPatchFromContents({
  filePath,
  oldContent,
  newContent,
  ignoreWhitespace = false,
  singleHunk = false,
}: {
  filePath: string
  oldContent: string
  newContent: string
  ignoreWhitespace?: boolean
  singleHunk?: boolean
}): StructuredPatchHunk[] {
  const result = structuredPatch(
    filePath,
    filePath,
    escapeForDiff(oldContent),
    escapeForDiff(newContent),
    undefined,
    undefined,
    {
      ignoreWhitespace,
      context: singleHunk ? 100_000 : CONTEXT_LINES,
    },
  )
  if (!result) return []
  return (result.hunks as StructuredPatchHunk[]).map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.map(unescapeFromDiff),
  }))
}

/**
 * Get a display-oriented patch after applying `edits`.
 *
 * ⚠️  Display patch has leading tabs converted to spaces (for consistent width
 * in UI). Do NOT use this patch to write content back — use the
 * `updatedFile` from `getPatchForEdits` (in editor.ts) instead.
 */
export function getPatchForDisplay({
  filePath,
  fileContents,
  edits,
  ignoreWhitespace = false,
}: {
  filePath: string
  fileContents: string
  edits: FileEdit[]
  ignoreWhitespace?: boolean
}): StructuredPatchHunk[] {
  const preparedFileContents = escapeForDiff(
    convertLeadingTabsToSpaces(fileContents),
  )
  const result = structuredPatch(
    filePath,
    filePath,
    preparedFileContents,
    edits.reduce((p, edit) => {
      const { old_string, new_string, replace_all } = edit
      const escapedOldString = escapeForDiff(
        convertLeadingTabsToSpaces(old_string),
      )
      const escapedNewString = escapeForDiff(
        convertLeadingTabsToSpaces(new_string),
      )
      if (replace_all) {
        return p.replaceAll(escapedOldString, () => escapedNewString)
      } else {
        return p.replace(escapedOldString, () => escapedNewString)
      }
    }, preparedFileContents),
    undefined,
    undefined,
    {
      context: CONTEXT_LINES,
      ignoreWhitespace,
    },
  )
  if (!result) return []
  return (result.hunks as StructuredPatchHunk[]).map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.map(unescapeFromDiff),
  }))
}
