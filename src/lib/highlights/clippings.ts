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
 *  created. Designed so the file renders as a usable Collection: each
 *  clipping shows its text as the headline, source path as subheadline,
 *  filterable; the locator / affix fields stay hidden noise. */
const CLIPPINGS_SCHEMA = {
  title: "Clippings",
  description:
    "Text clippings captured from workspace files. Append-only — `create` adds a clip, `remove` tombstones it.",
  entity: {
    title_field: "text",
    subtitle_field: "sourcePath",
  },
  fields: {
    text: {
      type: "paragraph",
      label: "Text",
      display: "headline",
      searchable: true,
    },
    sourcePath: {
      type: "text",
      label: "Source",
      display: "subheadline",
      filterable: true,
      searchable: true,
    },
    color: {
      type: "text",
      label: "Color",
      display: "meta",
    },
    note: {
      type: "paragraph",
      label: "Note",
      display: "body",
    },
    createdAt: {
      type: "datetime",
      label: "Captured",
      display: "meta",
    },
    // Replay-only fields — kept on the line for restore but hidden in
    // the Collection UI (the row is about the human-readable clip, not
    // the byte arithmetic that locates it).
    prefix: { type: "text", hide: true },
    suffix: { type: "text", hide: true },
    locator: { type: "object", hide: true },
    sourceBlobSha: { type: "text", hide: true },
  },
  list_view: {
    filters: ["sourcePath"],
    search: ["text", "sourcePath", "note"],
    sort: "-_updated_at",
    row: {
      title: "text",
      subtitle: "sourcePath",
      timestamp: "_updated_at",
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
  text: string
  prefix: string
  suffix: string
  color: string
  note: string
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
      text: highlight.text,
      prefix: highlight.prefix,
      suffix: highlight.suffix,
      color: highlight.color,
      note: highlight.note,
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
    existingText = stripCatN(read.data.file.content ?? "")
  } else if (read.errorCode !== ERR_FILE_NOT_FOUND) {
    return read
  }

  // 2. Parse existing lines into events (schema line is left alone —
  //    we re-emit prior lines verbatim, so the schema is preserved).
  const existingLines = existingText
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
  const events = parseEvents(existingLines)
  const hasSchema = existingLines.some((l) => l.includes('"op":"schema"'))

  // 3. Apply mutation, append, re-emit.
  const next = apply(events)
  const lines: string[] = []
  if (!hasSchema) {
    lines.push(buildSchemaLine())
  } else {
    // Preserve existing line order (including schema). Replace the
    // tail with our new event list.
    for (const l of existingLines) {
      if (l.includes('"op":"schema"')) {
        lines.push(l)
        break
      }
    }
  }
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
    if (
      typeof v.id !== "string" ||
      typeof v.sourcePath !== "string" ||
      typeof v.text !== "string" ||
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
      text: v.text,
      prefix: typeof v.prefix === "string" ? v.prefix : "",
      suffix: typeof v.suffix === "string" ? v.suffix : "",
      color: typeof v.color === "string" ? v.color : "accent",
      note: typeof v.note === "string" ? v.note : "",
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
        text: e.text,
        prefix: e.prefix,
        suffix: e.suffix,
        color: e.color,
        note: e.note,
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
