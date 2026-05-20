/**
 * huozi_memory_list — read a Project's effective memory.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §6 v3.3:
 *   - Reads `<project>/.huozi/memory.jsonl`, folds supersede / tombstone
 *     events, returns the currently-effective records.
 *   - No walk-up: workspace has no memory in v3.3, so a single-file read
 *     is the entire surface.
 *   - Dangling pointers (supersedes / target referring to ids never
 *     written) are tolerated — they just don't remove anything. This
 *     keeps the tool robust against partial commits or hand-edits.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import {
  MEMORY_TYPES,
  type MemoryRecordEvent,
  type MemorySupersedeEvent,
  type MemoryTombstoneEvent,
  type MemoryType,
} from '../storage/collection-schemas/memory.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const MEMORY_LIST_TOOL_NAME = 'huozi_memory_list'

const MEMORY_FILE_SUFFIX = '.huozi/memory.jsonl'

// ── Input / output schemas ────────────────────────────────────────────

export const memoryListInputSchema = z.object({
  project_path: z.string().min(1).describe(
    'Path to the project folder. Reads <project_path>/.huozi/memory.jsonl.',
  ),
  type: z.enum(MEMORY_TYPES).optional().describe(
    'Filter results to one memory type. Omit to return all four types.',
  ),
})

export type MemoryListInput = z.infer<typeof memoryListInputSchema>

const memoryRecordOutputSchema = z.object({
  id: z.string(),
  at: z.string(),
  by: z.string(),
  type: z.enum(MEMORY_TYPES),
  name: z.string(),
  body: z.string(),
  why: z.string().optional(),
  how_to_apply: z.string().optional(),
  origin_session: z.string().optional(),
  /** Present iff this row arose from a `supersede` event. */
  supersedes: z.string().optional(),
})

export const memoryListOutputSchema = z.object({
  filePath: z.string(),
  records: z.array(memoryRecordOutputSchema),
  /** Total events scanned in the file (records + supersedes + tombstones + schema). */
  total_events: z.number().int().nonnegative(),
})

export type MemoryListOutput = z.infer<typeof memoryListOutputSchema>

// ── Deps ──────────────────────────────────────────────────────────────

export interface MemoryListToolDeps {
  storage: StorageBackend
}

function memoryFilePath(projectPath: string): string {
  const trimmed = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  return `${trimmed}/${MEMORY_FILE_SUFFIX}`
}

// ── Fold algorithm ────────────────────────────────────────────────────

interface ActiveMemory {
  id: string
  at: string
  by: string
  type: MemoryType
  name: string
  body: string
  why?: string
  how_to_apply?: string
  origin_session?: string
  supersedes?: string
}

interface FoldResult {
  active: ActiveMemory[]
  totalEvents: number
  parseErrors: number
}

/**
 * Fold a memory.jsonl into the effective set. Iterates the file in
 * order:
 *   - `record` + `supersede` → add their `id` to the active map
 *   - `supersede` → also remove the prior id (`supersedes`) from the map
 *   - `tombstone` → remove the `target` id
 *   - Anything else (schema, malformed lines) → counted, skipped
 *
 * Returns the active records — ordering is preserved at this stage; the
 * caller sorts by `at` for presentation.
 */
function foldMemoryFile(text: string): FoldResult {
  const lines = text.split('\n')
  const active = new Map<string, ActiveMemory>()
  let totalEvents = 0
  let parseErrors = 0

  for (const raw of lines) {
    if (raw.length === 0) continue
    totalEvents++
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parseErrors++
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    const e = parsed as Record<string, unknown>
    const op = e.op
    if (op === 'schema') continue

    if (op === 'tombstone') {
      const tombstone = parsed as MemoryTombstoneEvent
      if (typeof tombstone.target === 'string') {
        active.delete(tombstone.target)
      }
      continue
    }

    if (op === 'record' || op === 'supersede') {
      const rec = parsed as MemoryRecordEvent | MemorySupersedeEvent
      if (
        typeof rec.id !== 'string' ||
        typeof rec.type !== 'string' ||
        typeof rec.name !== 'string' ||
        typeof rec.body !== 'string' ||
        !(MEMORY_TYPES as readonly string[]).includes(rec.type)
      ) {
        // Skip malformed rows; the validator on append should already
        // prevent these, but be defensive on read.
        parseErrors++
        continue
      }
      const entry: ActiveMemory = {
        id: rec.id,
        at: rec.at,
        by: rec.by,
        type: rec.type,
        name: rec.name,
        body: rec.body,
      }
      if (typeof rec.why === 'string') entry.why = rec.why
      if (typeof rec.how_to_apply === 'string') entry.how_to_apply = rec.how_to_apply
      if (typeof rec.origin_session === 'string') {
        entry.origin_session = rec.origin_session
      }
      if (op === 'supersede') {
        const sup = parsed as MemorySupersedeEvent
        if (typeof sup.supersedes === 'string') {
          active.delete(sup.supersedes)
          entry.supersedes = sup.supersedes
        }
      }
      active.set(entry.id, entry)
      continue
    }

    // Unknown op — skip (forward compatibility).
  }

  return { active: Array.from(active.values()), totalEvents, parseErrors }
}

// ── Tool ──────────────────────────────────────────────────────────────

export function memoryListPrompt(): string {
  return `List the currently-effective memories for a Project.

Usage:
- \`project_path\` must point at an upgraded Project (contains \`.huozi/memory.jsonl\`). Un-upgraded folders return an error.
- Optional \`type\` filter restricts the result to one of: feedback / project / reference / user.
- The tool folds \`supersede\` and \`tombstone\` events to derive the active set. Results are sorted by \`at\` descending so newer memories appear first.
- Call this when entering a Project folder to load conduct guidance the user has previously set down. Apply learned feedback before responding.

Example response:
{
  "filePath": "huozi-dev/.huozi/memory.jsonl",
  "records": [
    {
      "id": "m_abc...",
      "type": "feedback",
      "name": "Prefer terse responses",
      "body": "Skip trailing summaries — the diff already shows what changed.",
      "at": "2026-05-21T01:23:45.000Z",
      "by": "user:dachein"
    }
  ],
  "total_events": 5
}`
}

export function createMemoryListTool(
  deps: MemoryListToolDeps,
): Tool<MemoryListInput, MemoryListOutput> {
  return buildTool<MemoryListInput, MemoryListOutput>({
    name: MEMORY_LIST_TOOL_NAME,
    userFacingName: 'MemoryList',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: memoryListInputSchema,
    outputSchema: memoryListOutputSchema,
    async description() {
      return 'List effective Project memories (folds supersede / tombstone).'
    },
    async prompt() {
      return memoryListPrompt()
    },
    renderResult(data) {
      return `Loaded ${data.records.length} memor${data.records.length === 1 ? 'y' : 'ies'} from ${data.filePath}.`
    },

    async call(input, ctx): Promise<ToolResult<MemoryListOutput>> {
      const canon = canonicalizePath(input.project_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const filePath = memoryFilePath(canon.path)
      const file = await deps.storage.readFile(ctx.workspaceId, filePath)
      if (!file) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message:
            `No memory file at "${filePath}". The folder "${canon.path}" is not an upgraded Project.`,
        }
      }
      const text = new TextDecoder().decode(file.content)
      const { active, totalEvents } = foldMemoryFile(text)

      const filtered = input.type
        ? active.filter((r) => r.type === input.type)
        : active
      const sorted = [...filtered].sort((a, b) => b.at.localeCompare(a.at))

      return {
        kind: 'success',
        data: {
          filePath,
          records: sorted,
          total_events: totalEvents,
        },
      }
    },
  })
}
