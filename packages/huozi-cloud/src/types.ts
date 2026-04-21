/**
 * Core types for huozi-cloud's Tool system.
 *
 * Shape mirrors `cc:Tool.ts` where possible — see SPEC §4 for the full
 * mapping. Fields used only by CC's TUI (render* methods) are intentionally
 * omitted; MCP has its own rendering concerns.
 */

import type { z } from 'zod'

// ───── State (per-agent, per-session) ─────────────────────────────────────

/**
 * One cached `Read` result. Keyed by path in `ReadFileState`.
 *
 * `offset` and `limit` are preserved as-given (undefined if caller asked for
 * "whole file") so the `file_unchanged` cache check can match exact same
 * request shape.
 *
 * **NOTE**: content is intentionally NOT stored here. In CC it was used as a
 * fallback for Windows cloud-sync mtime false positives — we don't have that
 * problem (blob_sha is exact). Storing content blew the Durable Object
 * snapshot's 128 KB value size limit after a few large reads, silently
 * dropping state. Entries stay small and bounded.
 */
export interface ReadFileStateEntry {
  /** Git blob SHA at read time. Replaces CC's mtime + content-compare. */
  blob_sha: string
  /** The `offset` the caller provided (undefined = from start). */
  offset?: number
  /** The `limit` the caller provided (undefined = default / whole file). */
  limit?: number
  /** Unix ms when this entry was written. */
  readAt: number
}

/**
 * Abstract store for the per-agent read cache. Implementations:
 *   - InMemoryReadFileState (PoC / tests)
 *   - DurableObjectReadFileState (production, backed by AgentSessionDO)
 */
export interface ReadFileState {
  get(path: string): ReadFileStateEntry | undefined
  set(path: string, entry: ReadFileStateEntry): void
  delete(path: string): void
  clear(): void
  /** Iterate all (path, entry) pairs — used by persistence layer. */
  entries(): IterableIterator<[string, ReadFileStateEntry]>
}

// ───── Context passed into every tool call ───────────────────────────────

/**
 * The runtime context a tool receives. Mirrors cc:ToolUseContext but trimmed
 * to what we actually use. Additional fields (LSP notifier, analytics hook,
 * skill triggers) can be layered in later without breaking the contract.
 */
export interface ToolUseContext {
  /** The workspace this invocation is scoped to. */
  workspaceId: string
  /** Opaque principal identifier (user_id or agent_id). */
  principalId: string
  /** 'user' | 'agent' | 'system'. Used for audit author_type and userModified. */
  principalType: 'user' | 'agent' | 'system'
  /** Optional scope prefix (§2.4). Null = whole workspace. */
  scopePath: string | null
  /** Per-agent Read cache. */
  readFileState: ReadFileState
  /** Cancellation signal for the underlying operation. */
  abortSignal?: AbortSignal
}

// ───── Tool result union ──────────────────────────────────────────────────

export type ToolResult<O> =
  | { kind: 'success'; data: O }
  | {
      kind: 'error'
      errorCode: number
      message: string
      meta?: Record<string, unknown>
    }

// ───── Validation & permissions ──────────────────────────────────────────

export type ValidationResult =
  | { result: true; meta?: Record<string, unknown> }
  | {
      result: false
      message: string
      errorCode: number
      /**
       * 'ask' mirrors CC: the failure can escalate to the user for override.
       * 'fail' means hard reject (default).
       */
      behavior?: 'ask' | 'fail'
      meta?: Record<string, unknown>
    }

export type PermissionDecision =
  | { behavior: 'allow' }
  | { behavior: 'deny'; message: string }
  | { behavior: 'ask'; message?: string }

// ───── Tool definition + built tool ──────────────────────────────────────

/**
 * What tool authors supply to `buildTool()`. Anything marked optional has a
 * default applied by the factory (e.g. `isReadOnly: false`).
 */
export interface ToolDef<I, O> {
  /** Stable MCP tool name. */
  name: string
  /** Display name in UIs (if any). */
  userFacingName?: string
  /**
   * 20K for Grep, 100K for others (CC convention). Default 100_000.
   * Enforced by `buildTool` AFTER call() returns — truncates if over.
   */
  maxResultSizeChars?: number
  /** Hints. Default both false. */
  isConcurrencySafe?: boolean
  isReadOnly?: boolean

  /** Zod schemas for validation + MCP surface derivation. */
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>

  /** Short one-liner; shown alongside tool name in MCP. */
  description(): Promise<string>
  /**
   * Longer model-facing description (usage notes, flags, invariants).
   * Agents rely on this text for learned behaviors — must match CC's
   * original prompts verbatim for the 5 core tools.
   */
  prompt(): Promise<string>

  /** Optional pre-execution validation. Default: always passes. */
  validateInput?(input: I, ctx: ToolUseContext): Promise<ValidationResult>

  /** Optional permission check. Default: always allow. */
  checkPermissions?(input: I, ctx: ToolUseContext): Promise<PermissionDecision>

  /**
   * The actual implementation.
   * Return `{ kind: 'success', data }` or `{ kind: 'error', ... }`.
   */
  call(input: I, ctx: ToolUseContext): Promise<ToolResult<O>>

  /**
   * Render the structured output as the text payload sent back as an MCP
   * tool_result. Defaults to JSON.stringify(data).
   *
   * Critical for CC compat: some output types (e.g. `file_unchanged`) need
   * specific phrasing the model has learned to recognize.
   */
  renderResult?(data: O): string
}

/**
 * A tool built by `buildTool`. `run()` is the single entry point that wraps
 * validate → permission → call → truncate in the right order.
 */
export interface Tool<I, O> {
  readonly name: string
  readonly userFacingName: string
  readonly maxResultSizeChars: number
  readonly isConcurrencySafe: boolean
  readonly isReadOnly: boolean
  readonly inputSchema: z.ZodType<I>
  readonly outputSchema: z.ZodType<O>

  description(): Promise<string>
  prompt(): Promise<string>

  /** The orchestrated execution entry point. */
  run(input: unknown, ctx: ToolUseContext): Promise<ToolResult<O>>

  /** The renderer used after a successful run. */
  renderResult(data: O): string
}
