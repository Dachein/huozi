/**
 * Canonical schema for Agent Memory Collections (`.huozi/memory.jsonl`).
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §6 v3.3:
 *   - Memory is a Collection variant, schema-fixed, append-only.
 *   - Lives only inside upgraded Projects, eager-created at Upgrade time.
 *   - No workspace-level memory (cross-project conventions live in WS README).
 *   - Folds `supersede` / `tombstone` ops to derive current effective set.
 *
 * This file is the single source of truth for:
 *   - The first-line `op:"schema"` event seeded into a fresh memory.jsonl.
 *   - The validator both `huozi_memory_append` (in this package) and the
 *     renderer (when surfacing chips/labels) rely on.
 */

/**
 * Closed set of `op` values memory.jsonl supports.
 *
 *   schema     — first line, self-describing
 *   record     — a new memory event (any type)
 *   supersede  — references an old id, marks it inactive
 *   tombstone  — explicitly retires an id (no replacement)
 */
export const MEMORY_OPS = [
  'schema',
  'record',
  'supersede',
  'tombstone',
] as const
export type MemoryOp = (typeof MEMORY_OPS)[number]

/**
 * The four memory categories (spec §6.7).
 *
 *   feedback   — agent-conduct guidance from the user
 *   project    — project facts, constraints, status
 *   reference  — pointer to where info lives in external systems
 *   user       — user role / preferences / background
 */
export const MEMORY_TYPES = [
  'feedback',
  'project',
  'reference',
  'user',
] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

/**
 * Render schema seeded as the first line of every fresh memory.jsonl.
 * Mirrors spec §6.5 verbatim.
 *
 * Field types map to the Collection renderer's `jsonl-field-widgets`
 * dispatch (`src/components/jsonl-field-widgets.tsx`). `body` is
 * richtext so memory text can use markdown / inline links.
 */
export const MEMORY_SCHEMA = {
  title: 'Agent Memory',
  entity: {
    title_field: 'name',
    subtitle_field: 'type',
    avatar_field: 'type',
  },
  fields: {
    name: { type: 'text', display: 'headline' },
    type: {
      type: 'select',
      display: 'aside',
      filterable: true,
      options: [
        { value: 'feedback', label: 'Feedback', color: 'amber' },
        { value: 'project', label: 'Project', color: 'blue' },
        { value: 'reference', label: 'Reference', color: 'slate' },
        { value: 'user', label: 'User', color: 'purple' },
      ],
    },
    body: { type: 'richtext', display: 'body' },
    why: { type: 'text', display: 'meta' },
    how_to_apply: { type: 'text', display: 'meta' },
    origin_session: { type: 'text', display: 'aside' },
  },
  list_view: {
    filters: ['type'],
    search: ['name', 'body'],
  },
} as const

/**
 * Build the first-line schema event for a fresh memory.jsonl.
 * Returns the JSON-encoded string (no trailing newline) — callers append
 * `\n` when seeding the file.
 */
export function buildInitialMemorySchemaLine(
  options: { at?: string; by?: string; version?: number } = {},
): string {
  const event = {
    op: 'schema' as const,
    at: options.at ?? new Date().toISOString(),
    by: options.by ?? 'system',
    version: options.version ?? 1,
    schema: MEMORY_SCHEMA,
  }
  return JSON.stringify(event)
}

// ── Event shapes (post-validation) ────────────────────────────────────

/** A `record` event: a new piece of memory of one of the four types. */
export interface MemoryRecordEvent {
  op: 'record'
  id: string
  at: string
  by: string
  type: MemoryType
  name: string
  body: string
  why?: string
  how_to_apply?: string
  origin_session?: string
}

/** A `supersede` event: new record replaces an older one by id. */
export interface MemorySupersedeEvent {
  op: 'supersede'
  id: string
  at: string
  by: string
  type: MemoryType
  name: string
  body: string
  why?: string
  how_to_apply?: string
  origin_session?: string
  /** Id of the record this replaces. */
  supersedes: string
}

/** A `tombstone` event: retire a record outright, no replacement. */
export interface MemoryTombstoneEvent {
  op: 'tombstone'
  id: string
  at: string
  by: string
  /** Id of the record being retired. */
  target: string
}

export type MemoryEvent =
  | MemoryRecordEvent
  | MemorySupersedeEvent
  | MemoryTombstoneEvent

// ── Validator ─────────────────────────────────────────────────────────

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Validate a memory event payload (the post-tool-input shape — after
 * `id` / `at` / `by` / `origin_session` have been filled in by the
 * caller). Pure-function, no I/O.
 *
 * What gets checked:
 *   - `op` is one of MEMORY_OPS (not "schema" — that's seeded
 *     separately, never user-written through this path)
 *   - For record/supersede: `type` is one of MEMORY_TYPES, `name` and
 *     `body` are non-empty strings
 *   - For supersede: `supersedes` is a non-empty string
 *   - For tombstone: `target` is a non-empty string
 *   - `id` / `at` / `by` are non-empty strings
 *
 * What is NOT checked here (callers' responsibility):
 *   - That `supersedes` / `target` actually points to a known id in
 *     the file. The fold step in `huozi_memory_list` tolerates
 *     dangling pointers (it just silently drops them from the active
 *     set), so dangling-ref enforcement is a UX nicety, not a
 *     correctness gate.
 */
export function validateMemoryEvent(
  event: unknown,
): ValidateResult {
  if (event === null || typeof event !== 'object') {
    return { ok: false, error: 'event must be an object' }
  }
  const e = event as Record<string, unknown>
  if (typeof e.op !== 'string') {
    return { ok: false, error: 'event.op must be a string' }
  }
  if (e.op === 'schema') {
    return {
      ok: false,
      error:
        'op:"schema" is seeded by the system; clients write record/supersede/tombstone only',
    }
  }
  if (!isMemoryOp(e.op)) {
    return {
      ok: false,
      error: `event.op must be one of ${MEMORY_OPS.join(' | ')}, got "${e.op}"`,
    }
  }
  if (!isNonEmptyString(e.id)) {
    return { ok: false, error: 'event.id must be a non-empty string' }
  }
  if (!isNonEmptyString(e.at)) {
    return { ok: false, error: 'event.at must be a non-empty ISO timestamp' }
  }
  if (!isNonEmptyString(e.by)) {
    return { ok: false, error: 'event.by must be a non-empty principal id' }
  }

  if (e.op === 'tombstone') {
    if (!isNonEmptyString(e.target)) {
      return {
        ok: false,
        error: 'tombstone event must include "target" id',
      }
    }
    return { ok: true }
  }

  // record / supersede share the same body shape
  if (!isMemoryType(e.type)) {
    return {
      ok: false,
      error: `event.type must be one of ${MEMORY_TYPES.join(' | ')}, got "${String(e.type)}"`,
    }
  }
  if (!isNonEmptyString(e.name)) {
    return { ok: false, error: 'event.name must be a non-empty string' }
  }
  if (!isNonEmptyString(e.body)) {
    return { ok: false, error: 'event.body must be a non-empty string' }
  }
  if (e.why !== undefined && typeof e.why !== 'string') {
    return { ok: false, error: 'event.why must be a string when present' }
  }
  if (e.how_to_apply !== undefined && typeof e.how_to_apply !== 'string') {
    return {
      ok: false,
      error: 'event.how_to_apply must be a string when present',
    }
  }
  if (e.origin_session !== undefined && typeof e.origin_session !== 'string') {
    return {
      ok: false,
      error: 'event.origin_session must be a string when present',
    }
  }

  if (e.op === 'supersede') {
    if (!isNonEmptyString(e.supersedes)) {
      return {
        ok: false,
        error: 'supersede event must include "supersedes" pointing at the old id',
      }
    }
  }
  return { ok: true }
}

function isMemoryOp(v: unknown): v is MemoryOp {
  return typeof v === 'string' && (MEMORY_OPS as readonly string[]).includes(v)
}

function isMemoryType(v: unknown): v is MemoryType {
  return typeof v === 'string' && (MEMORY_TYPES as readonly string[]).includes(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}
