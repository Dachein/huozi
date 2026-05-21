/**
 * huozi_task_append — append one lifecycle event to an existing task
 * inside a Project's tasks.jsonl.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §5.5 v3.3:
 *   - Tasks are entities in a single-file Collection (`tasks.jsonl`).
 *     Their state is a fold of all events sharing the same `id`.
 *   - State transitions are just append events: `op:"status"` with a
 *     new status, `op:"archive"` to retire, `op:"dispatch"` to start a
 *     run, etc. There is no "update entity" primitive — the renderer
 *     and any downstream tool re-fold the timeline.
 *   - The bridge daemon already writes its own events (dispatch /
 *     agent_turn / tool_use / result) directly via huozi_edit; this
 *     tool exists so an agent OR an external coordinator can mutate
 *     task state without composing JSONL by hand.
 *   - Created via `huozi_task_create`; status etc. via this tool.
 *
 * The op set mirrors `TASK_OPS` in `src/lib/tasks/schema.ts` minus
 * `create` (use huozi_task_create for that). Status transitions are
 * the common case; we accept the wider op vocabulary for symmetry.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const TASK_APPEND_TOOL_NAME = 'huozi_task_append'

const TASKS_FILE = 'tasks.jsonl'

// Op vocabulary the tool accepts. `create` is intentionally excluded —
// it lives on huozi_task_create where UUID minting is wired up.
const TASK_APPEND_OPS = [
  'status',
  'archive',
  'dispatch',
  'agent_turn',
  'tool_use',
  'tool_result',
  'confirm_requested',
  'user_action',
  'result',
  'run_paused',
  'run_resumed',
] as const

const TASK_STATUSES = [
  'pending',
  'working',
  'awaiting_user',
  'done',
  'archived',
] as const

// ── Input / output ────────────────────────────────────────────────────

const taskEventInputSchema = z.object({
  op: z.enum(TASK_APPEND_OPS).describe(
    `Event op. Common: "status" to change task status, "archive" to retire. Full set: ${TASK_APPEND_OPS.join(' | ')}.`,
  ),
  status: z.enum(TASK_STATUSES).optional().describe(
    'New status. Required when op is "status"; ignored otherwise.',
  ),
  body: z.string().optional(),
  summary: z.string().optional(),
  run_id: z.string().optional(),
  result_kind: z.string().optional(),
  // Open-ended extras — any other primitive fields are passed through.
}).passthrough()

export const taskAppendInputSchema = z.object({
  project_path: z.string().min(1).describe(
    'Project folder containing the tasks.jsonl Collection.',
  ),
  task_id: z.string().min(1).describe(
    'The task entity id to append onto. Must already exist in tasks.jsonl (created via huozi_task_create).',
  ),
  event: taskEventInputSchema,
})

export type TaskAppendInput = z.infer<typeof taskAppendInputSchema>

export const taskAppendOutputSchema = z.object({
  filePath: z.string(),
  task_id: z.string(),
  op: z.string(),
  at: z.string(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
})

export type TaskAppendOutput = z.infer<typeof taskAppendOutputSchema>

// ── Deps ──────────────────────────────────────────────────────────────

export interface TaskAppendToolDeps {
  storage: StorageBackend
}

function tasksFilePath(projectPath: string): string {
  const trimmed = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  return `${trimmed}/${TASKS_FILE}`
}

function taskExistsInFile(text: string, taskId: string): boolean {
  for (const raw of text.split('\n')) {
    if (raw.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    const e = parsed as Record<string, unknown>
    if (e.op === 'schema') continue
    if (e.id === taskId) return true
  }
  return false
}

export function taskAppendPrompt(): string {
  return `Append one lifecycle event to an existing task in a Project's tasks.jsonl.

Usage:
- \`project_path\` is the Project folder; \`task_id\` is the entity id returned by huozi_task_create.
- \`event.op\` is the event kind. Common cases:
    op: "status", status: "done" / "working" / "awaiting_user" / "pending" / "archived"
    op: "archive"  — final state, equivalent to status:"archived" but explicit
    op: "result", result_kind: "ok" | "error", summary: "..." — used when an agent run finishes
    op: "run_paused" / "run_resumed" — bridge daemon state
    op: "agent_turn" / "tool_use" / "tool_result" — streamed events (the bridge daemon writes these itself; mostly you won't need them from chat)
- The server fills \`at\` and \`by\` automatically.
- Tasks must already exist (created via huozi_task_create). Calling this on an unknown id returns task_not_found.

Example (mark a task done):
{
  "project_path": "huozi-dev",
  "task_id": "<uuid>",
  "event": { "op": "status", "status": "done" }
}

Example (archive a task with a note):
{
  "project_path": "huozi-dev",
  "task_id": "<uuid>",
  "event": { "op": "archive", "summary": "Superseded by <other_task>." }
}`
}

// ── Tool ──────────────────────────────────────────────────────────────

export function createTaskAppendTool(
  deps: TaskAppendToolDeps,
): Tool<TaskAppendInput, TaskAppendOutput> {
  return buildTool<TaskAppendInput, TaskAppendOutput>({
    name: TASK_APPEND_TOOL_NAME,
    userFacingName: 'TaskAppend',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: taskAppendInputSchema,
    outputSchema: taskAppendOutputSchema,
    async description() {
      return 'Append one lifecycle event (status / archive / result / ...) to an existing task in tasks.jsonl.'
    },
    async prompt() {
      return taskAppendPrompt()
    },
    renderResult(data) {
      return `✓ Appended ${data.op} to task ${data.task_id.slice(0, 8)}… in ${data.filePath} (commit ${data.commit_sha.slice(0, 8)}).`
    },

    async validateInput(input) {
      if (input.event.op === 'status' && !input.event.status) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message:
            `event.status is required when op="status" (one of ${TASK_STATUSES.join(' | ')}).`,
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<TaskAppendOutput>> {
      const canon = canonicalizePath(input.project_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const filePath = tasksFilePath(canon.path)

      const existing = await deps.storage.readFile(ctx.workspaceId, filePath)
      if (!existing) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message:
            `No tasks file at "${filePath}". The folder "${canon.path}" is not an upgraded Project.`,
        }
      }

      const existingText = new TextDecoder().decode(existing.content)
      if (!taskExistsInFile(existingText, input.task_id)) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message:
            `No task "${input.task_id}" found in ${filePath}. Create it first with huozi_task_create.`,
        }
      }

      const at = new Date().toISOString()
      const by = `${ctx.principalType}:${ctx.principalId}`

      // Compose the event line. Caller can pass through any open-ended
      // fields via the passthrough zod schema; we just sit them on top
      // of the canonical id/at/by/op.
      const event: Record<string, unknown> = {
        id: input.task_id,
        at,
        by,
        ...input.event,
      }

      const newLine = JSON.stringify(event) + '\n'
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
        message: `task_append: ${input.event.op} ${input.task_id} in ${canon.path}`,
      })

      ctx.readFileState.set(filePath, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      return {
        kind: 'success',
        data: {
          filePath,
          task_id: input.task_id,
          op: input.event.op,
          at,
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
        },
      }
    },
  })
}
