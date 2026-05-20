/**
 * huozi_memory_append — append one event to a Project's memory.jsonl.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §6 v3.3:
 *   - Memory only lives at the project level (no workspace memory).
 *   - The file is the sentinel: if `<project>/.huozi/memory.jsonl`
 *     doesn't exist, the folder hasn't been Upgraded — the tool refuses
 *     rather than auto-creating, since the Upgrade flow is the only
 *     authority allowed to mint a new project.
 *
 * Caller passes the event body; the tool fills in `id`, `at`, `by`, and
 * (optionally) `origin_session`. Op is inferred from the event shape so
 * MCP clients have one knob, not three:
 *   - has `target`     → op:"tombstone"
 *   - has `supersedes` → op:"supersede"
 *   - otherwise        → op:"record"
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import {
  MEMORY_TYPES,
  type MemoryEvent,
  validateMemoryEvent,
} from '../storage/collection-schemas/memory.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const MEMORY_APPEND_TOOL_NAME = 'huozi_memory_append'

const MEMORY_FILE_SUFFIX = '.huozi/memory.jsonl'

// ── Input / output schemas ────────────────────────────────────────────

const memoryTypeSchema = z.enum(MEMORY_TYPES)

/**
 * Open event shape — fields are conditionally required based on which
 * op the caller is implicitly invoking (record vs supersede vs
 * tombstone). The tool's `validateInput` enforces the cross-field
 * constraints with friendly messages; zod just sketches the surface.
 */
const memoryEventInputSchema = z.object({
  type: memoryTypeSchema.optional().describe(
    'One of "feedback" / "project" / "reference" / "user". Required for record + supersede. Omit for tombstone.',
  ),
  name: z.string().min(1).optional().describe(
    'Short headline for the memory ("user prefers terse responses"). Required for record + supersede.',
  ),
  body: z.string().min(1).optional().describe(
    'Full body text (markdown OK). Required for record + supersede. Lead with the rule/fact, then **Why:** and **How to apply:** lines for feedback/project entries.',
  ),
  why: z.string().optional().describe('Reason / motivation behind the rule or fact.'),
  how_to_apply: z.string().optional().describe('Guidance for when / where to apply.'),
  supersedes: z.string().min(1).optional().describe(
    'Id of an existing record this one replaces. Presence flips op to "supersede".',
  ),
  target: z.string().min(1).optional().describe(
    'Id of an existing record to retire. Presence flips op to "tombstone". XOR with `supersedes`.',
  ),
  origin_session: z.string().optional().describe(
    'Opaque session id to attribute this memory to. Optional; pass when the MCP client has session context.',
  ),
})

export const memoryAppendInputSchema = z.object({
  project_path: z.string().min(1).describe(
    'Path to the project folder (e.g. "huozi-dev"). The tool reads <project_path>/.huozi/memory.jsonl. Folder must already be an upgraded Project — the tool refuses to mint memory for un-upgraded folders.',
  ),
  event: memoryEventInputSchema,
})

export type MemoryAppendInput = z.infer<typeof memoryAppendInputSchema>

export const memoryAppendOutputSchema = z.object({
  filePath: z.string(),
  id: z.string(),
  op: z.enum(['record', 'supersede', 'tombstone']),
  at: z.string(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
})

export type MemoryAppendOutput = z.infer<typeof memoryAppendOutputSchema>

// ── Deps + helpers ────────────────────────────────────────────────────

export interface MemoryAppendToolDeps {
  storage: StorageBackend
}

function inferOp(event: MemoryAppendInput['event']): 'record' | 'supersede' | 'tombstone' {
  if (typeof event.target === 'string' && event.target.length > 0) return 'tombstone'
  if (typeof event.supersedes === 'string' && event.supersedes.length > 0) return 'supersede'
  return 'record'
}

function memoryFilePath(projectPath: string): string {
  const trimmed = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  return `${trimmed}/${MEMORY_FILE_SUFFIX}`
}

function newMemoryId(): string {
  // crypto.randomUUID is available in Workers + Node 19+. Prefix mirrors
  // the spec's "m_..." convention so ids are visually distinct from task
  // ids in mixed logs.
  return `m_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function memoryAppendPrompt(): string {
  return `Append one memory event to a Project's memory.jsonl.

Usage:
- \`project_path\` must point at an upgraded Project (folder containing \`.huozi/memory.jsonl\`). The tool will NOT auto-create the file — Upgrade is the only path that mints a new Project.
- \`event\` describes the new memory. The op is inferred from the event shape:
  - \`target\` set     → \`op:"tombstone"\` (retire an existing memory id, no replacement)
  - \`supersedes\` set → \`op:"supersede"\` (new record replaces an older id)
  - otherwise         → \`op:"record"\` (a fresh memory)
- For \`record\` / \`supersede\`: \`type\`, \`name\`, \`body\` are required. \`type\` is one of: feedback / project / reference / user. For feedback or project entries, lead the body with the rule, then **Why:** and **How to apply:** lines.
- The server fills in \`id\` (\`m_<hex>\`), \`at\` (ISO timestamp), \`by\` (caller principal). Optionally include \`origin_session\` to tie the memory to an MCP session.

Example (record a feedback memory):
{
  "project_path": "huozi-dev",
  "event": {
    "type": "feedback",
    "name": "Prefer terse responses",
    "body": "Skip trailing summaries — the diff already shows what changed.\\n**Why:** user said so directly.\\n**How to apply:** end-of-turn 1–2 sentences max.",
    "why": "User stated 2026-05-21",
    "how_to_apply": "Default behavior unless they ask for detail."
  }
}

Example (supersede a stale fact):
{
  "project_path": "huozi-dev",
  "event": {
    "type": "project",
    "name": "Spec version",
    "body": "Authoritative spec is v3.3 (was v3.1).",
    "supersedes": "m_abc123..."
  }
}`
}

// ── Tool ──────────────────────────────────────────────────────────────

export function createMemoryAppendTool(
  deps: MemoryAppendToolDeps,
): Tool<MemoryAppendInput, MemoryAppendOutput> {
  return buildTool<MemoryAppendInput, MemoryAppendOutput>({
    name: MEMORY_APPEND_TOOL_NAME,
    userFacingName: 'MemoryAppend',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: memoryAppendInputSchema,
    outputSchema: memoryAppendOutputSchema,
    async description() {
      return 'Append one memory event (record / supersede / tombstone) to a Project\'s .huozi/memory.jsonl.'
    },
    async prompt() {
      return memoryAppendPrompt()
    },
    renderResult(data) {
      return `✓ Appended ${data.op} memory ${data.id} to ${data.filePath} at ${data.at}.`
    },

    async validateInput(input) {
      const canon = canonicalizePath(input.project_path)
      if (!canon.ok) {
        return { result: false, errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const op = inferOp(input.event)
      if (op !== 'tombstone') {
        if (!input.event.type) {
          return {
            result: false,
            errorCode: ERR.INVALID_URI,
            message: `event.type is required for op="${op}" (one of ${MEMORY_TYPES.join(' | ')})`,
          }
        }
        if (!input.event.name) {
          return {
            result: false,
            errorCode: ERR.INVALID_URI,
            message: `event.name is required for op="${op}"`,
          }
        }
        if (!input.event.body) {
          return {
            result: false,
            errorCode: ERR.INVALID_URI,
            message: `event.body is required for op="${op}"`,
          }
        }
      }
      if (
        typeof input.event.target === 'string' &&
        typeof input.event.supersedes === 'string'
      ) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message:
            'event.target and event.supersedes are mutually exclusive (tombstone vs supersede)',
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<MemoryAppendOutput>> {
      const canon = canonicalizePath(input.project_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const projectPath = canon.path
      const filePath = memoryFilePath(projectPath)

      const existing = await deps.storage.readFile(ctx.workspaceId, filePath)
      if (!existing) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message:
            `No memory file at "${filePath}". The folder "${projectPath}" is not an upgraded Project — ` +
            'run the Upgrade flow first (creates README frontmatter + tasks.jsonl + .huozi/memory.jsonl together).',
        }
      }

      const op = inferOp(input.event)
      const at = new Date().toISOString()
      const by = `${ctx.principalType}:${ctx.principalId}`
      const id = newMemoryId()

      const event: Record<string, unknown> = {
        op,
        id,
        at,
        by,
      }
      if (op === 'tombstone') {
        event.target = input.event.target
      } else {
        event.type = input.event.type
        event.name = input.event.name
        event.body = input.event.body
        if (input.event.why !== undefined) event.why = input.event.why
        if (input.event.how_to_apply !== undefined) {
          event.how_to_apply = input.event.how_to_apply
        }
        if (input.event.origin_session !== undefined) {
          event.origin_session = input.event.origin_session
        }
        if (op === 'supersede') {
          event.supersedes = input.event.supersedes
        }
      }

      const check = validateMemoryEvent(event)
      if (!check.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: `Memory event failed validation: ${check.error}`,
        }
      }

      const newLine = JSON.stringify(event) + '\n'
      const existingText = new TextDecoder().decode(existing.content)
      const needsLeadingNewline =
        existingText.length > 0 && !existingText.endsWith('\n')
      const finalText = existingText + (needsLeadingNewline ? '\n' : '') + newLine
      const bytes = new TextEncoder().encode(finalText)

      const writeResult = await deps.storage.writeFile({
        workspaceId: ctx.workspaceId,
        path: filePath,
        content: bytes,
        author: { id: ctx.principalId, type: ctx.principalType },
        parent_sha: existing.blob_sha,
        message: `memory_append: ${op} ${id} in ${projectPath}`,
      })

      // Reflect the new state into the per-session read cache, mirroring
      // CollectionInitTool / WriteTool, so a subsequent Edit on this file
      // does not require an explicit Read first.
      ctx.readFileState.set(filePath, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      // event was the source for the line we just wrote — re-projecting
      // to MemoryEvent for the typed output ensures TS catches drift.
      const typedEvent = event as unknown as MemoryEvent
      return {
        kind: 'success',
        data: {
          filePath,
          id: typedEvent.id,
          op: typedEvent.op,
          at: typedEvent.at,
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
        },
      }
    },
  })
}
