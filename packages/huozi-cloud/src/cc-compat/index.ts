/**
 * cc-compat — Worker-safe ports of Claude Code's pure file-manipulation
 * algorithms. Shared across all huozi-cloud tool implementations.
 *
 * Sources (commit-level pinned by SPEC附录 A):
 *   - editor.ts        ← cc:tools/FileEditTool/utils.ts
 *   - diff.ts          ← cc:utils/diff.ts
 *   - fileRead.ts      ← cc:utils/fileRead.ts  (refactored: bytes in, not path)
 *   - ruleMatching.ts  ← cc:utils/permissions/shellRuleMatching.ts
 *   - internal.ts      ← cc:utils/{file,stringUtils,array}.ts  (trimmed)
 *
 * Semantics are intentionally identical to CC's. Any Agent familiar with
 * CC's behavior will see the same matching / patching / quote handling here.
 */

// Editor — findActualString, preserveQuoteStyle, getPatchForEdit, desanitize
export {
  applyEditToFile,
  findActualString,
  getEditsForPatch,
  getPatchForEdit,
  getPatchForEdits,
  getSnippet,
  getSnippetForPatch,
  getSnippetForTwoFileDiff,
  LEFT_DOUBLE_CURLY_QUOTE,
  LEFT_SINGLE_CURLY_QUOTE,
  normalizeFileEditInput,
  normalizeQuotes,
  preserveQuoteStyle,
  RIGHT_DOUBLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  stripTrailingWhitespace,
} from './editor.js'
export type { EditInput } from './editor.js'

// Diff — structured patch generation
export {
  adjustHunkLineNumbers,
  CONTEXT_LINES,
  countLinesChanged,
  DIFF_TIMEOUT_MS,
  getPatchForDisplay,
  getPatchFromContents,
} from './diff.js'
export type {
  FileEdit,
  LineChangeCounts,
  StructuredPatchHunk,
} from './diff.js'

// fileRead — encoding + line-ending detection (Uint8Array input)
export {
  detectEncoding,
  detectLineEndings,
  encodeContentForWrite,
  readBytesWithMetadata,
} from './fileRead.js'
export type { DetectedEncoding, LineEndingType } from './fileRead.js'

// Rule matching — wildcards + legacy `:*` prefix
export {
  hasWildcards,
  matchWildcardPattern,
  parsePermissionRule,
  permissionRuleExtractPrefix,
} from './ruleMatching.js'
export type { ShellPermissionRule } from './ruleMatching.js'

// Internal helpers — exposed for reuse across other modules in huozi-cloud
export {
  addLineNumbers,
  convertLeadingTabsToSpaces,
  count,
  countCharInString,
} from './internal.js'
