/**
 * Edit/Write algorithms — the heart of CC's file tools.
 *
 * Ported from: cc:tools/FileEditTool/utils.ts
 *
 * Changes from CC:
 *   - Removed `readFileSyncCached` dependency — callers pass `fileContent` in
 *   - Removed `expandPath` — path handling is done upstream in the cloud
 *   - Removed `logError` — errors bubble up; callers log
 *   - Imports `./diff` (our ported version) and `./internal` (inlined helpers)
 *   - `normalizeFileEditInput` now takes `fileContent` explicitly
 *
 * EVERYTHING ELSE IS BYTE-IDENTICAL TO CC. The algorithms (quote normalization,
 * apply-edits-with-conflict-check, patch computation, desanitization) are
 * exactly what CC runs. This is critical for "Agent sees the same behavior".
 */

import { structuredPatch } from 'diff'
import {
  CONTEXT_LINES,
  DIFF_TIMEOUT_MS,
  type FileEdit,
  getPatchForDisplay,
  getPatchFromContents,
  type StructuredPatchHunk,
} from './diff.js'
import {
  addLineNumbers,
  convertLeadingTabsToSpaces,
  countCharInString,
} from './internal.js'

// ───── Quote normalization ─────────────────────────────────────────────────

// Claude can't emit curly quotes, so they're defined as module constants.
// Files containing curly quotes would otherwise never match straight-quote
// `old_string` from the model.
export const LEFT_SINGLE_CURLY_QUOTE = '\u2018'
export const RIGHT_SINGLE_CURLY_QUOTE = '\u2019'
export const LEFT_DOUBLE_CURLY_QUOTE = '\u201C'
export const RIGHT_DOUBLE_CURLY_QUOTE = '\u201D'

export function normalizeQuotes(str: string): string {
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"')
}

/** Strip trailing whitespace from each line, preserving the original line ending. */
export function stripTrailingWhitespace(str: string): string {
  const lines = str.split(/(\r\n|\n|\r)/)
  let result = ''
  for (let i = 0; i < lines.length; i++) {
    const part = lines[i]
    if (part !== undefined) {
      if (i % 2 === 0) result += part.replace(/\s+$/, '')
      else result += part
    }
  }
  return result
}

/**
 * Find the actual substring in `fileContent` that matches `searchString`,
 * accounting for curly/straight quote differences.
 *
 * Returns the ACTUAL bytes from the file (preserves curly quotes) so the
 * caller can do `file.split(actualString)` reliably. Returns null if no match.
 */
export function findActualString(
  fileContent: string,
  searchString: string,
): string | null {
  if (fileContent.includes(searchString)) return searchString

  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedFile = normalizeQuotes(fileContent)
  const searchIndex = normalizedFile.indexOf(normalizedSearch)
  if (searchIndex !== -1) {
    return fileContent.substring(
      searchIndex,
      searchIndex + searchString.length,
    )
  }
  return null
}

function isOpeningContext(chars: string[], index: number): boolean {
  if (index === 0) return true
  const prev = chars[index - 1]
  return (
    prev === ' ' ||
    prev === '\t' ||
    prev === '\n' ||
    prev === '\r' ||
    prev === '(' ||
    prev === '[' ||
    prev === '{' ||
    prev === '\u2014' ||
    prev === '\u2013'
  )
}

function applyCurlyDoubleQuotes(str: string): string {
  const chars = [...str]
  const result: string[] = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      result.push(
        isOpeningContext(chars, i)
          ? LEFT_DOUBLE_CURLY_QUOTE
          : RIGHT_DOUBLE_CURLY_QUOTE,
      )
    } else {
      result.push(chars[i]!)
    }
  }
  return result.join('')
}

function applyCurlySingleQuotes(str: string): string {
  const chars = [...str]
  const result: string[] = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") {
      const prev = i > 0 ? chars[i - 1] : undefined
      const next = i < chars.length - 1 ? chars[i + 1] : undefined
      const prevIsLetter = prev !== undefined && /\p{L}/u.test(prev)
      const nextIsLetter = next !== undefined && /\p{L}/u.test(next)
      if (prevIsLetter && nextIsLetter) {
        // Contraction (don't, it's) → right single curly
        result.push(RIGHT_SINGLE_CURLY_QUOTE)
      } else {
        result.push(
          isOpeningContext(chars, i)
            ? LEFT_SINGLE_CURLY_QUOTE
            : RIGHT_SINGLE_CURLY_QUOTE,
        )
      }
    } else {
      result.push(chars[i]!)
    }
  }
  return result.join('')
}

/**
 * When `findActualString` matched via quote normalization (file has curly,
 * model sent straight), apply the file's curly style to `new_string` so the
 * edit preserves typography.
 */
export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  if (oldString === actualOldString) return newString

  const hasDoubleQuotes =
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE)
  const hasSingleQuotes =
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE)

  if (!hasDoubleQuotes && !hasSingleQuotes) return newString

  let result = newString
  if (hasDoubleQuotes) result = applyCurlyDoubleQuotes(result)
  if (hasSingleQuotes) result = applyCurlySingleQuotes(result)
  return result
}

// ───── Applying edits ─────────────────────────────────────────────────────

/**
 * Apply a single edit to file content.
 *
 * Subtle behavior (kept from CC): when deleting content (`newString === ''`)
 * and `oldString` does NOT end in a newline but IS immediately followed by one
 * in the file, strip the trailing newline too — so deleting a line doesn't
 * leave a blank where it was.
 */
export function applyEditToFile(
  originalContent: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  const f = replaceAll
    ? (c: string, s: string, r: string) => c.replaceAll(s, () => r)
    : (c: string, s: string, r: string) => c.replace(s, () => r)

  if (newString !== '') return f(originalContent, oldString, newString)

  const stripTrailingNewline =
    !oldString.endsWith('\n') && originalContent.includes(oldString + '\n')

  return stripTrailingNewline
    ? f(originalContent, oldString + '\n', newString)
    : f(originalContent, oldString, newString)
}

/**
 * Compute the patch for a single edit. Thin wrapper around `getPatchForEdits`.
 * Returns { patch, updatedFile }. Does NOT write to disk.
 */
export function getPatchForEdit({
  filePath,
  fileContents,
  oldString,
  newString,
  replaceAll = false,
}: {
  filePath: string
  fileContents: string
  oldString: string
  newString: string
  replaceAll?: boolean
}): { patch: StructuredPatchHunk[]; updatedFile: string } {
  return getPatchForEdits({
    filePath,
    fileContents,
    edits: [
      {
        old_string: oldString,
        new_string: newString,
        replace_all: replaceAll,
      },
    ],
  })
}

/**
 * Apply a sequence of edits and return the final patch + updated file.
 *
 * Enforces two invariants:
 *   1. `old_string` from edit N+1 must NOT be a substring of any
 *      previously-applied `new_string` (prevents unintentional re-matching).
 *   2. Each edit must actually change the content (throws if no-op).
 *
 * Special case: a single {old:'', new:''} edit on empty content is a no-op
 * returning an empty file (used for `touch`-style file creation in CC).
 */
export function getPatchForEdits({
  filePath,
  fileContents,
  edits,
}: {
  filePath: string
  fileContents: string
  edits: FileEdit[]
}): { patch: StructuredPatchHunk[]; updatedFile: string } {
  let updatedFile = fileContents
  const appliedNewStrings: string[] = []

  // Special case for empty files + empty edit.
  if (
    !fileContents &&
    edits.length === 1 &&
    edits[0] &&
    edits[0].old_string === '' &&
    edits[0].new_string === ''
  ) {
    const patch = getPatchForDisplay({
      filePath,
      fileContents,
      edits: [
        {
          old_string: fileContents,
          new_string: updatedFile,
          replace_all: false,
        },
      ],
    })
    return { patch, updatedFile: '' }
  }

  for (const edit of edits) {
    const oldStringToCheck = edit.old_string.replace(/\n+$/, '')

    // Invariant 1: no previously-applied new_string may contain this
    // edit's old_string — would be unintentional re-match.
    for (const previousNewString of appliedNewStrings) {
      if (
        oldStringToCheck !== '' &&
        previousNewString.includes(oldStringToCheck)
      ) {
        throw new Error(
          'Cannot edit file: old_string is a substring of a new_string from a previous edit.',
        )
      }
    }

    const previousContent = updatedFile
    updatedFile =
      edit.old_string === ''
        ? edit.new_string
        : applyEditToFile(
            updatedFile,
            edit.old_string,
            edit.new_string,
            edit.replace_all,
          )

    if (updatedFile === previousContent) {
      throw new Error('String not found in file. Failed to apply edit.')
    }

    appliedNewStrings.push(edit.new_string)
  }

  if (updatedFile === fileContents) {
    throw new Error(
      'Original and edited file match exactly. Failed to apply edit.',
    )
  }

  // Go direct to structured diff — skip the re-apply-via-replace path that
  // `getPatchForDisplay` uses (saves ~20% on large files).
  const patch = getPatchFromContents({
    filePath,
    oldContent: convertLeadingTabsToSpaces(fileContents),
    newContent: convertLeadingTabsToSpaces(updatedFile),
  })

  return { patch, updatedFile }
}

// ───── Snippets (for UI / attachments) ────────────────────────────────────

const DIFF_SNIPPET_MAX_BYTES = 8192

/**
 * Snippet of changed context between two file versions, for attaching to a
 * message. Caps at 8 KB; truncates at a line boundary.
 */
export function getSnippetForTwoFileDiff(
  fileAContents: string,
  fileBContents: string,
): string {
  const patch = structuredPatch(
    'file.txt',
    'file.txt',
    fileAContents,
    fileBContents,
    undefined,
    undefined,
    { context: 8 },
  )
  if (!patch) return ''

  const full = patch.hunks
    .map((h) => ({
      startLine: h.oldStart,
      content: h.lines
        .filter((ln) => !ln.startsWith('-') && !ln.startsWith('\\'))
        .map((ln) => ln.slice(1))
        .join('\n'),
    }))
    .map((p) =>
      addLineNumbers({ content: p.content, startLine: p.startLine }),
    )
    .join('\n...\n')

  if (full.length <= DIFF_SNIPPET_MAX_BYTES) return full
  const cutoff = full.lastIndexOf('\n', DIFF_SNIPPET_MAX_BYTES)
  const kept =
    cutoff > 0 ? full.slice(0, cutoff) : full.slice(0, DIFF_SNIPPET_MAX_BYTES)
  const remaining = countCharInString(full, '\n', kept.length) + 1
  return `${kept}\n\n... [${remaining} lines truncated] ...`
}

const SNIPPET_CONTEXT_LINES = 4

/** Snippet from the NEW file showing context around a patch's changes. */
export function getSnippetForPatch(
  patch: StructuredPatchHunk[],
  newFile: string,
): { formattedSnippet: string; startLine: number } {
  if (patch.length === 0) return { formattedSnippet: '', startLine: 1 }

  let minLine = Infinity
  let maxLine = -Infinity
  for (const hunk of patch) {
    if (hunk.oldStart < minLine) minLine = hunk.oldStart
    const hunkEnd = hunk.oldStart + (hunk.newLines || 0) - 1
    if (hunkEnd > maxLine) maxLine = hunkEnd
  }

  const startLine = Math.max(1, minLine - SNIPPET_CONTEXT_LINES)
  const endLine = maxLine + SNIPPET_CONTEXT_LINES
  const fileLines = newFile.split(/\r?\n/)
  const snippetLines = fileLines.slice(startLine - 1, endLine)
  const snippet = snippetLines.join('\n')
  const formattedSnippet = addLineNumbers({ content: snippet, startLine })
  return { formattedSnippet, startLine }
}

/** Convenience: snippet around a single edit (without going through a patch). */
export function getSnippet(
  originalFile: string,
  oldString: string,
  newString: string,
  contextLines = 4,
): { snippet: string; startLine: number } {
  const before = originalFile.split(oldString)[0] ?? ''
  const replacementLine = before.split(/\r?\n/).length - 1
  const newFileLines = applyEditToFile(originalFile, oldString, newString).split(
    /\r?\n/,
  )
  const startLine = Math.max(0, replacementLine - contextLines)
  const endLine =
    replacementLine + contextLines + newString.split(/\r?\n/).length
  const snippetLines = newFileLines.slice(startLine, endLine)
  return { snippet: snippetLines.join('\n'), startLine: startLine + 1 }
}

/** Extract individual edit pairs from a patch's hunks (inverse of apply). */
export function getEditsForPatch(patch: StructuredPatchHunk[]): FileEdit[] {
  return patch.map((hunk) => {
    const oldLines: string[] = []
    const newLines: string[] = []
    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        oldLines.push(line.slice(1))
        newLines.push(line.slice(1))
      } else if (line.startsWith('-')) {
        oldLines.push(line.slice(1))
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1))
      }
    }
    return {
      old_string: oldLines.join('\n'),
      new_string: newLines.join('\n'),
      replace_all: false,
    }
  })
}

// ───── Desanitization ─────────────────────────────────────────────────────

/**
 * Claude API sanitizes certain XML-like tokens before the model sees them.
 * The model can therefore only OUTPUT the sanitized versions. When using an
 * `old_string` from the model to match file content, desanitize first —
 * otherwise matches silently fail on content containing e.g.
 * `<function_results>`.
 *
 * This table MUST stay in sync with CC's (cc:utils.ts:531-550).
 */
const DESANITIZATIONS: Record<string, string> = {
  '<fnr>': '<function_results>',
  '<n>': '<name>',
  '</n>': '</name>',
  '<o>': '<output>',
  '</o>': '</output>',
  '<e>': '<error>',
  '</e>': '</error>',
  '<s>': '<system>',
  '</s>': '</system>',
  '<r>': '<result>',
  '</r>': '</result>',
  '< META_START >': '<META_START>',
  '< META_END >': '<META_END>',
  '< EOT >': '<EOT>',
  '< META >': '<META>',
  '< SOS >': '<SOS>',
  '\n\nH:': '\n\nHuman:',
  '\n\nA:': '\n\nAssistant:',
}

function desanitizeMatchString(matchString: string): {
  result: string
  appliedReplacements: Array<{ from: string; to: string }>
} {
  let result = matchString
  const appliedReplacements: Array<{ from: string; to: string }> = []

  for (const [from, to] of Object.entries(DESANITIZATIONS)) {
    const beforeReplace = result
    result = result.replaceAll(from, to)
    if (beforeReplace !== result) {
      appliedReplacements.push({ from, to })
    }
  }
  return { result, appliedReplacements }
}

/**
 * Normalize edit inputs for a given file content.
 *
 * ⚠️  Divergence from CC: CC reads the file via `readFileSyncCached`. Here the
 * caller supplies `fileContent` (already loaded from R2). Everything else is
 * byte-identical.
 *
 * Behavior:
 *   - For .md/.mdx files, trailing whitespace in `new_string` is preserved
 *     (trailing two spaces = hard line break in Markdown).
 *   - Otherwise, trailing whitespace is stripped from `new_string`.
 *   - If exact `old_string` doesn't match, try desanitization; if the
 *     desanitized form matches, apply the same replacements to `new_string`.
 */
export interface EditInput {
  old_string: string
  new_string: string
  replace_all?: boolean
}

export function normalizeFileEditInput({
  file_path,
  fileContent,
  edits,
}: {
  file_path: string
  fileContent: string
  edits: EditInput[]
}): { file_path: string; edits: EditInput[] } {
  if (edits.length === 0) return { file_path, edits }

  const isMarkdown = /\.(md|mdx)$/i.test(file_path)

  return {
    file_path,
    edits: edits.map(({ old_string, new_string, replace_all }) => {
      const normalizedNewString = isMarkdown
        ? new_string
        : stripTrailingWhitespace(new_string)

      if (fileContent.includes(old_string)) {
        return {
          old_string,
          new_string: normalizedNewString,
          replace_all,
        }
      }

      const { result: desanitizedOldString, appliedReplacements } =
        desanitizeMatchString(old_string)

      if (fileContent.includes(desanitizedOldString)) {
        let desanitizedNewString = normalizedNewString
        for (const { from, to } of appliedReplacements) {
          desanitizedNewString = desanitizedNewString.replaceAll(from, to)
        }
        return {
          old_string: desanitizedOldString,
          new_string: desanitizedNewString,
          replace_all,
        }
      }

      return {
        old_string,
        new_string: normalizedNewString,
        replace_all,
      }
    }),
  }
}

// Re-export diff helpers so callers only need to import from './editor'
export { CONTEXT_LINES, DIFF_TIMEOUT_MS, getPatchForDisplay, getPatchFromContents }
export type { FileEdit, StructuredPatchHunk }
