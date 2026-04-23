/**
 * Public entry point for huozi-cloud.
 *
 * v1 surface: Tool factory + 5 tools (Read/Edit/Write/Glob/Grep) + in-memory
 * backends for tests/PoC. Production wiring (Workers, R2, D1, DurableObjects,
 * MCP server) lands in subsequent packages and consumes this module.
 */

// Tool machinery
export { buildTool } from './Tool.js'
export type {
  PermissionDecision,
  ReadFileState,
  ReadFileStateEntry,
  Tool,
  ToolDef,
  ToolResult,
  ToolUseContext,
  ValidationResult,
} from './types.js'

// Errors + stubs
export { ERR, FILE_UNCHANGED_STUB } from './errors.js'
export type { ErrorCode } from './errors.js'

// State
export { InMemoryReadFileState } from './state/ReadFileState.js'

// Storage
export { InMemoryStorage } from './storage/memory.js'
export { StaleError } from './storage/types.js'
export type {
  Author,
  BatchWriteArgs,
  BatchWriteItemResult,
  BatchWriteResult,
  CommitPathEntry,
  CommitRecord,
  FileRecord,
  ListCommitsOptions,
  ListCommitsResult,
  ListEntry,
  ListOptions,
  StorageBackend,
  WriteResult,
} from './storage/types.js'

// Utils
export { canonicalizePath } from './utils/path.js'
export { globToRegex, GREP_TYPE_GLOBS, matchGlob } from './utils/glob.js'

// Tools — Read
export {
  createReadTool,
  MAX_INLINE_BINARY_BYTES,
  MAX_LINES_TO_READ,
  MAX_OUTPUT_SIZE_BYTES,
  READ_TOOL_NAME,
  readInputSchema,
  readOutputSchema,
} from './tools/ReadTool/index.js'
export type {
  BinaryRefSigner,
  ReadInput,
  ReadOutput,
  ReadToolDeps,
} from './tools/ReadTool/index.js'

// Tools — Edit
export {
  createEditTool,
  EDIT_TOOL_NAME,
  editInputSchema,
  editOutputSchema,
} from './tools/EditTool.js'
export type { EditInput, EditOutput, EditToolDeps } from './tools/EditTool.js'

// Tools — Write
export {
  createWriteTool,
  WRITE_TOOL_NAME,
  writeInputSchema,
  writeOutputSchema,
} from './tools/WriteTool.js'
export type { WriteInput, WriteOutput, WriteToolDeps } from './tools/WriteTool.js'

// Tools — Glob
export {
  createGlobTool,
  GLOB_TOOL_NAME,
  globInputSchema,
  globOutputSchema,
} from './tools/GlobTool.js'
export type { GlobInput, GlobOutput, GlobToolDeps } from './tools/GlobTool.js'

// Tools — Grep
export {
  createGrepTool,
  GREP_TOOL_NAME,
  grepInputSchema,
  grepOutputSchema,
} from './tools/GrepTool.js'
export type { GrepInput, GrepOutput, GrepToolDeps } from './tools/GrepTool.js'

// Tools — ListTree (huozi extension)
export {
  createListTreeTool,
  LIST_TREE_TOOL_NAME,
  listTreeInputSchema,
  listTreeOutputSchema,
} from './tools/ListTreeTool.js'
export type {
  ListTreeInput,
  ListTreeOutput,
  ListTreeToolDeps,
} from './tools/ListTreeTool.js'

// Tools — Mkdir / Rm / Mv (huozi extensions for folder semantics)
export {
  createMkdirTool,
  KEEP_FILENAME,
  MKDIR_TOOL_NAME,
  mkdirInputSchema,
  mkdirOutputSchema,
} from './tools/MkdirTool.js'
export type {
  MkdirInput,
  MkdirOutput,
  MkdirToolDeps,
} from './tools/MkdirTool.js'

export {
  createRmTool,
  RM_TOOL_NAME,
  rmInputSchema,
  rmOutputSchema,
} from './tools/RmTool.js'
export type { RmInput, RmOutput, RmToolDeps } from './tools/RmTool.js'

export {
  createMvTool,
  MV_TOOL_NAME,
  mvInputSchema,
  mvOutputSchema,
} from './tools/MvTool.js'
export type { MvInput, MvOutput, MvToolDeps } from './tools/MvTool.js'

// Tools — Batch Edit (huozi extension)
export {
  BATCH_EDIT_TOOL_NAME,
  batchEditInputSchema,
  batchEditOutputSchema,
  createBatchEditTool,
} from './tools/BatchEditTool.js'
export type {
  BatchEditInput,
  BatchEditOutput,
  BatchEditToolDeps,
} from './tools/BatchEditTool.js'

// Tools — History (huozi extension)
export {
  createHistoryTool,
  HISTORY_TOOL_NAME,
  historyInputSchema,
  historyOutputSchema,
} from './tools/HistoryTool.js'
export type {
  HistoryInput,
  HistoryOutput,
  HistoryToolDeps,
} from './tools/HistoryTool.js'

// Security
export {
  formatSecretError,
  isAllowlisted,
  redactSecret,
  scanForSecrets,
  SECRET_RULES,
} from './security/secrets.js'
export type { SecretMatch, SecretRule } from './security/secrets.js'

// cc-compat algorithms (re-exported so consumers can reuse)
export * as ccCompat from './cc-compat/index.js'
