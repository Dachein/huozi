/**
 * Error codes used across huozi-cloud tools.
 *
 * 1–99:   Mirror Claude Code's error codes (cc:FileEditTool/constants.ts and
 *         scattered validateInput failures) so Agent behavior stays learned.
 * 100+:   huozi extensions (SPEC §10.4).
 */

export const ERR = {
  // — CC-aligned (1..10) —
  NO_CHANGES: 1, // old === new
  DENIED_BY_RULE: 2, // permission deny
  CANNOT_CREATE_FILE_EXISTS: 3,
  FILE_NOT_FOUND: 4,
  USE_NOTEBOOK_EDIT: 5, // .ipynb routed elsewhere
  NOT_READ_FIRST: 6, // Edit/Write before Read
  MODIFIED_SINCE_READ: 7, // staleness
  STRING_NOT_FOUND: 8, // old_string miss
  AMBIGUOUS_MATCH: 9, // multiple matches, no replace_all
  FILE_TOO_LARGE: 10,

  // — huozi extensions (100+) —
  SCOPE_VIOLATION: 101, // path escapes scope (§7.4)
  SECRET_DETECTED: 102, // security scanner hit
  READ_FILE_TOO_LARGE: 103, // v1 binary > 4 MB, caller should use pages or signed URL
  INVALID_URI: 110, // not a huozi:// URI
  CONFLICT: 111, // resource already exists (e.g. slug taken)
  INTERNAL: 112, // unexpected server-side failure
  HTML_VALIDATION_FAILED: 120, // .html write would introduce error-level lint issues
} as const

export type ErrorCode = (typeof ERR)[keyof typeof ERR]

/**
 * Stable stub the model has learned to recognize (cc:FileReadTool/prompt.ts:7-8).
 * Must not be reworded.
 */
export const FILE_UNCHANGED_STUB =
  'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'

/**
 * Shared path-not-found hint suffix.
 */
export const FILE_NOT_FOUND_CWD_NOTE =
  'The provided path was not found relative to the workspace root.'
