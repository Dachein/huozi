/**
 * Server-side IO for the workspace-root `clippings.jsonl` collection.
 *
 * The file follows the Tasks/Inbox convention: line 1 is a `schema`
 * event that drives Collection rendering; every subsequent line is an
 * event on one clipping entity (`id`).
 *
 * Mutations append events — they never rewrite earlier lines. The fold
 * function reads the full file, walks events in order, and projects a
 * `Map<id, HighlightWithSource | tombstone>`.
 *
 * Why append-only instead of in-place edits:
 *   - Matches the existing CollectionView fold semantics for free.
 *   - History is preserved (audit / undo via huozi_history).
 *   - huozi_write is the only mutation primitive, but we still benefit
 *     from session-DO read-before-write for staleness checks.
 */

import {
  cloudRead,
  cloudReadForEdit,
  cloudWrite,
  stripCatN,
  type McpResult,
} from "@/lib/drive/mcp-client"
import { parseJsonl } from "@/lib/jsonl/parse"
import {
  clippingsFilePathFor,
  type Highlight,
  type HighlightWithSource,
} from "./types"

const ERR_FILE_NOT_FOUND = 4
const ERR_NOT_READ_FIRST = 6
const ERR_MODIFIED_SINCE_READ = 7

/** Schema event written as line 1 the first time clippings.jsonl is
 *  created. The clipping passage *is* the note — clippings have no
 *  separate title concept. The source file path stands in as the row
 *  title (a citation); the note renders as preview (2-line clamp) in
 *  the list and as body (full text) in the detail view. Replay-only
 *  fields stay on the line but are hidden from the UI. */
const CLIPPINGS_SCHEMA = {
  title: "Clippings",
  description:
    "Text clippings captured from workspace files. Each entity is one passage; the source file is recorded for reference.",
  entity: {
    title_field: "sourcePath",
  },
  fields: {
    note: {
      type: "paragraph",
      label: "Note",
      display: "body",
      searchable: true,
    },
    sourcePath: {
      type: "text",
      label: "Source",
      filterable: true,
      searchable: true,
      // Hidden in the body section — already rendered as the entity
      // title in the detail header, no need to repeat.
      hide: true,
    },
    createdAt: {
      type: "datetime",
      label: "Captured",
      display: "meta",
      format: "relative",
    },
    // Replay-only fields — kept on the line for restore but hidden in
    // the Collection UI (these are byte arithmetic, not user content).
    prefix: { type: "text", hide: true },
    suffix: { type: "text", hide: true },
    locator: { type: "object", hide: true },
    color: { type: "text", hide: true },
    sourceBlobSha: { type: "text", hide: true },
  },
  list_view: {
    filters: ["sourcePath"],
    search: ["note", "sourcePath"],
    sort: "-createdAt",
    row: {
      // Row 1: source path as title (1-line truncate) + relative time.
      // Row 3: the note clamped to 2 lines as preview (muted, smaller).
      title: "sourcePath",
      timestamp: "createdAt",
      preview: "note",
    },
  },
} as const

interface CreateEvent {
  op: "create"
  at: string
  by: string
  id: string
  sourcePath: string
  sourceBlobSha: string | null
  /** The captured passage. Stored under `note` so the Collection schema
   *  can render it as body/preview without a renaming step. */
  note: string
  prefix: string
  suffix: string
  color: string
  createdAt: string
  locator: Highlight["locator"]
}

interface RemoveEvent {
  op: "remove"
  at: string
  by: string
  id: string
}

type ClippingEvent = CreateEvent | RemoveEvent

/**
 * Load every live (non-tombstoned) clipping from clippings.jsonl,
 * optionally filtered to one source path. Returns the entries in
 * "newest first" capture order so the drawer can render them directly.
 */
export interface LoadClippingsResult {
  kind: "ok"
  clippings: HighlightWithSource[]
}
export interface LoadClippingsError {
  kind: "error"
  code: number
  message: string
}
export type LoadResult = LoadClippingsResult | LoadClippingsError

export async function loadClippings(
  key: string,
  userId: string,
  opts: { sourcePath?: string } = {},
): Promise<LoadResult> {
  const res = await cloudRead(key, clippingsFilePathFor(userId))
  if (!res.ok) {
    if (res.errorCode === ERR_FILE_NOT_FOUND) {
      return { kind: "ok", clippings: [] }
    }
    return { kind: "error", code: res.errorCode, message: res.message }
  }
  const raw = stripCatN(res.data.file.content ?? "")
  const folded = foldClippingsFile(raw)
  let list = Array.from(folded.values())
  if (opts.sourcePath !== undefined) {
    list = list.filter((c) => c.sourcePath === opts.sourcePath)
  }
  // Newest first so the drawer reads top-to-bottom by recency.
  list.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )
  return { kind: "ok", clippings: list }
}

/**
 * Append a `create` event for one new clipping. Seeds the schema line
 * the first time clippings.jsonl appears. Returns the freshly-loaded
 * list so callers can re-render without a follow-up GET.
 */
export async function createClipping(
  key: string,
  userId: string,
  highlight: Highlight,
  sourcePath: string,
  sourceBlobSha: string | null,
  by: string,
): Promise<McpResult<HighlightWithSource[]>> {
  return mutate(key, userId, by, (current) => {
    const event: CreateEvent = {
      op: "create",
      at: new Date().toISOString(),
      by,
      id: highlight.id,
      sourcePath,
      sourceBlobSha,
      note: highlight.note,
      prefix: highlight.prefix,
      suffix: highlight.suffix,
      color: highlight.color,
      createdAt: highlight.createdAt,
      locator: highlight.locator,
    }
    return [...current, event]
  })
}

/**
 * Append a `remove` event tombstoning the clipping by id. Idempotent —
 * removing an already-removed id appends another `remove` (cheap) so
 * the call doesn't fail under retry, and the fold still treats the id
 * as gone.
 */
export async function removeClipping(
  key: string,
  userId: string,
  id: string,
  by: string,
): Promise<McpResult<HighlightWithSource[]>> {
  return mutate(key, userId, by, (current) => {
    const event: RemoveEvent = {
      op: "remove",
      at: new Date().toISOString(),
      by,
      id,
    }
    return [...current, event]
  })
}

// ── internals ───────────────────────────────────────────────────────────

async function mutate(
  key: string,
  userId: string,
  _by: string,
  apply: (current: ClippingEvent[]) => ClippingEvent[],
): Promise<McpResult<HighlightWithSource[]>> {
  const path = clippingsFilePathFor(userId)
  // 1. Read current state via the session DO so huozi_write's
  //    Read-first invariant is satisfied if the file exists.
  const read = await cloudReadForEdit(key, path)
  let existingText = ""
  let exists = false
  if (read.ok) {
    exists = true
    // Worker omits `content` when it returns `file_unchanged` — i.e.
    // the session DO knows this principal already saw this blob_sha.
    // We don't keep per-process state across Next.js requests, so the
    // missing content would silently become an empty file here and the
    // subsequent write would wipe every prior event. Re-fetch the
    // bytes via a non-session read; the session state populated by the
    // first read still authorizes the upcoming write.
    const initialContent = read.data.file.content
    if (initialContent === undefined || read.data.type === "file_unchanged") {
      const refetch = await cloudRead(key, path)
      if (!refetch.ok) {
        if (refetch.errorCode === ERR_FILE_NOT_FOUND) {
          exists = false
        } else {
          return refetch
        }
      } else {
        existingText = stripCatN(refetch.data.file.content ?? "")
      }
    } else {
      existingText = stripCatN(initialContent)
    }
  } else if (read.errorCode !== ERR_FILE_NOT_FOUND) {
    return read
  }

  // 2. Parse existing lines into events (schema line is left alone —
  //    we re-emit prior lines verbatim, so the schema is preserved).
  const existingLines = existingText
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
  const events = parseEvents(existingLines)

  // 3. Apply mutation, append, re-emit.
  //
  // The schema line is *always* rebuilt from the current
  // CLIPPINGS_SCHEMA constant — we own the file end-to-end, so any
  // older shape on disk is upgraded in place the next time the user
  // clips. This is intentionally divergent from inbox/tasks (which
  // accumulate user-authored schema events); for clippings the
  // rendering config is library-owned, not user-extensible.
  const next = apply(events)
  const lines: string[] = [buildSchemaLine()]
  for (const e of next) {
    lines.push(JSON.stringify(e))
  }
  const content = `${lines.join("\n")}\n`

  // 4. Write back. Session must stay opted-in for updates so the prior
  //    Read counts toward the freshness check.
  const write = await cloudWrite(
    key,
    { file_path: path, content },
    { useSession: exists },
  )
  if (!write.ok) {
    if (
      !exists &&
      (write.errorCode === ERR_NOT_READ_FIRST ||
        write.errorCode === ERR_MODIFIED_SINCE_READ)
    ) {
      // Race: file appeared between our missing-read and our write.
      // One retry through the read-then-write path.
      return mutate(key, userId, _by, apply)
    }
    return write
  }

  // 5. Project & return the fresh state so the API can hand it back.
  const folded = foldClippingsFile(content)
  return {
    ok: true,
    data: Array.from(folded.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    ),
    rendered: write.rendered,
  }
}

function buildSchemaLine(): string {
  return JSON.stringify({
    op: "schema",
    at: new Date().toISOString(),
    by: "system",
    version: 1,
    schema: CLIPPINGS_SCHEMA,
  })
}

function parseEvents(lines: string[]): ClippingEvent[] {
  const events: ClippingEvent[] = []
  for (const l of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(l)
    } catch {
      continue
    }
    const e = coerceEvent(parsed)
    if (e) events.push(e)
  }
  return events
}

function coerceEvent(value: unknown): ClippingEvent | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.op === "create") {
    // Back-compat: pre-rename clippings carried the passage in `text`.
    // Read either field so existing per-user files don't blank out
    // after the schema rename; writers only emit `note` going forward.
    const passage =
      typeof v.note === "string"
        ? v.note
        : typeof v.text === "string"
          ? v.text
          : null
    if (
      typeof v.id !== "string" ||
      typeof v.sourcePath !== "string" ||
      passage === null ||
      typeof v.createdAt !== "string"
    ) {
      return null
    }
    return {
      op: "create",
      at: typeof v.at === "string" ? v.at : new Date().toISOString(),
      by: typeof v.by === "string" ? v.by : "user",
      id: v.id,
      sourcePath: v.sourcePath,
      sourceBlobSha:
        typeof v.sourceBlobSha === "string" ? v.sourceBlobSha : null,
      note: passage,
      prefix: typeof v.prefix === "string" ? v.prefix : "",
      suffix: typeof v.suffix === "string" ? v.suffix : "",
      color: typeof v.color === "string" ? v.color : "accent",
      createdAt: v.createdAt,
      locator: v.locator as Highlight["locator"],
    }
  }
  if (v.op === "remove") {
    if (typeof v.id !== "string") return null
    return {
      op: "remove",
      at: typeof v.at === "string" ? v.at : new Date().toISOString(),
      by: typeof v.by === "string" ? v.by : "user",
      id: v.id,
    }
  }
  return null
}

/** Fold events into a Map<id, Highlight>. The `remove` op tombstones
 *  the id; subsequent `create`s for the same id (unlikely but harmless)
 *  resurrect with the new content. Schema lines are ignored — they're
 *  handled by the renderer, not this projection. */
function foldClippingsFile(content: string): Map<string, HighlightWithSource> {
  const parsed = parseJsonl(content)
  const out = new Map<string, HighlightWithSource>()
  const events = parseEvents(parsed.lines.map((l) => l.originalText))
  for (const e of events) {
    if (e.op === "create") {
      out.set(e.id, {
        id: e.id,
        note: e.note,
        prefix: e.prefix,
        suffix: e.suffix,
        color: e.color,
        createdAt: e.createdAt,
        locator: e.locator,
        sourcePath: e.sourcePath,
        sourceBlobSha: e.sourceBlobSha,
      })
    } else if (e.op === "remove") {
      out.delete(e.id)
    }
  }
  return out
}
