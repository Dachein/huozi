/**
 * huozi_task_list — fold a Project's tasks.jsonl into the per-task
 * current state.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §5.5 v3.3:
 *   - tasks.jsonl is a single-file Collection. Each task is an entity
 *     identified by `id`; its current state is a fold of all events
 *     sharing that id.
 *   - The renderer projects `status` from the op sequence via the rules
 *     in tasks.md §4 (mirrored here in `projectStatus`).
 *   - This tool gives agents a one-call way to ask "what tasks exist
 *     in this Project, and where are they?" without having to read +
 *     parse + fold the file by hand. Symmetrical with huozi_memory_list.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const TASK_LIST_TOOL_NAME = 'huozi_task_list'

const TASKS_FILE = 'tasks.jsonl'

const TASK_STATUSES = [
  'pending',
  'working',
  'awaiting_user',
  'done',
  'archived',
] as const
type TaskStatus = (typeof TASK_STATUSES)[number]

// ── Input / output ────────────────────────────────────────────────────

export const taskListInputSchema = z.object({
  project_path: z.string().min(1).describe(
    'Project folder containing the tasks.jsonl Collection.',
  ),
  status: z.enum(TASK_STATUSES).optional().describe(
    'Filter results to one status. Omit to return all statuses.',
  ),
  /**
   * `include_archived` defaults to false because most agent queries
   * want "what should I be working on?" — archived tasks pollute that
   * list. Set true to see the long tail.
   */
  include_archived: z.boolean().optional().describe(
    'Default false. Set true to include archived tasks in the result.',
  ),
})

export type TaskListInput = z.infer<typeof taskListInputSchema>

const taskOutputSchema = z.object({
  id: z.string(),
  status: z.enum(TASK_STATUSES),
  title: z.string().optional(),
  body: z.string().optional(),
  source_refs: z.array(z.string()).optional(),
  deliverable: z.string().optional(),
  created_at: z.string().optional(),
  last_event_at: z.string().optional(),
  /** Distinct run_ids observed for this task. */
  runs: z.array(z.string()).optional(),
})

export const taskListOutputSchema = z.object({
  filePath: z.string(),
  tasks: z.array(taskOutputSchema),
  total_events: z.number().int().nonnegative(),
})

export type TaskListOutput = z.infer<typeof taskListOutputSchema>

// ── Deps ──────────────────────────────────────────────────────────────

export interface TaskListToolDeps {
  storage: StorageBackend
}

function tasksFilePath(projectPath: string): string {
  const trimmed = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  return `${trimmed}/${TASKS_FILE}`
}

/**
 * Project the latest status from a per-task op sequence. Mirrors the
 * rules in `src/lib/tasks/schema.ts` `projectStatus()`: scan backwards,
 * first projection wins; custom ops are skipped.
 */
function projectStatus(ops: readonly string[]): TaskStatus {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]
    switch (op) {
      case 'archive':
        return 'archived'
      case 'result':
        return 'done'
      case 'confirm_requested':
        return 'awaiting_user'
      case 'user_action':
      case 'dispatch':
      case 'agent_turn':
      case 'tool_use':
      case 'tool_result':
      case 'run_resumed':
        return 'working'
      case 'create':
      case 'ingest':
      case 'run_paused':
        return 'pending'
      default:
        continue
    }
  }
  return 'pending'
}

interface FoldedTask {
  id: string
  status: TaskStatus
  ops: string[]
  /** Latest explicit status from an `op:"status"` event, if any. */
  explicitStatus: TaskStatus | null
  title?: string
  body?: string
  source_refs?: string[]
  deliverable?: string
  created_at?: string
  last_event_at?: string
  runs: Set<string>
}

function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v)
}

function foldTasksFile(
  text: string,
): { tasks: FoldedTask[]; totalEvents: number } {
  const map = new Map<string, FoldedTask>()
  let totalEvents = 0

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
    totalEvents++
    if (typeof e.id !== 'string' || typeof e.op !== 'string') continue

    let task = map.get(e.id)
    if (!task) {
      task = {
        id: e.id,
        status: 'pending',
        ops: [],
        explicitStatus: null,
        runs: new Set(),
      }
      map.set(e.id, task)
    }
    task.ops.push(e.op)
    if (typeof e.at === 'string') task.last_event_at = e.at
    if (e.op === 'create') {
      if (typeof e.at === 'string') task.created_at = e.at
      if (typeof e.title === 'string') task.title = e.title
      if (typeof e.body === 'string') task.body = e.body
      if (typeof e.deliverable === 'string') task.deliverable = e.deliverable
      if (Array.isArray(e.source_refs)) {
        task.source_refs = e.source_refs.filter(
          (s): s is string => typeof s === 'string',
        )
      }
    }
    if (e.op === 'status' && isTaskStatus(e.status)) {
      task.explicitStatus = e.status
    }
    if (typeof e.run_id === 'string') task.runs.add(e.run_id)
  }

  // Final status projection per task. An explicit `op:"status"` event
  // wins over the op-sequence projection — that's the whole point of
  // surfacing the op (the user / agent stated the status directly).
  for (const t of map.values()) {
    t.status = t.explicitStatus ?? projectStatus(t.ops)
  }

  return { tasks: Array.from(map.values()), totalEvents }
}

export function taskListPrompt(): string {
  return `List active tasks in a Project, with each task's current state.

Usage:
- \`project_path\` must point at an upgraded Project (contains tasks.jsonl).
- Optional \`status\` filter narrows the result. Optional \`include_archived\` (default false) decides whether retired tasks show up.
- Returns one row per distinct task id, with status projected from its event sequence (per the rules in tasks.md §4).
- Symmetrical to huozi_memory_list — use this on entering a Project to see what's open before deciding what to do.

Example response:
{
  "filePath": "huozi-dev/tasks.jsonl",
  "tasks": [
    {
      "id": "...uuid...",
      "status": "working",
      "title": "Reply to Stratechery digest",
      "created_at": "2026-05-21T01:23Z",
      "last_event_at": "2026-05-21T02:01Z",
      "runs": ["run-a", "run-b"]
    }
  ],
  "total_events": 14
}`
}

export function createTaskListTool(
  deps: TaskListToolDeps,
): Tool<TaskListInput, TaskListOutput> {
  return buildTool<TaskListInput, TaskListOutput>({
    name: TASK_LIST_TOOL_NAME,
    userFacingName: 'TaskList',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: taskListInputSchema,
    outputSchema: taskListOutputSchema,
    async description() {
      return 'List Project tasks with folded current state (status / title / runs).'
    },
    async prompt() {
      return taskListPrompt()
    },
    renderResult(data) {
      return `Loaded ${data.tasks.length} task${data.tasks.length === 1 ? '' : 's'} from ${data.filePath}.`
    },

    async call(input, ctx): Promise<ToolResult<TaskListOutput>> {
      const canon = canonicalizePath(input.project_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const filePath = tasksFilePath(canon.path)
      const file = await deps.storage.readFile(ctx.workspaceId, filePath)
      if (!file) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message:
            `No tasks file at "${filePath}". The folder "${canon.path}" is not an upgraded Project.`,
        }
      }
      const text = new TextDecoder().decode(file.content)
      const { tasks, totalEvents } = foldTasksFile(text)

      const filtered = tasks.filter((t) => {
        if (!input.include_archived && t.status === 'archived') return false
        if (input.status && t.status !== input.status) return false
        return true
      })

      const sorted = [...filtered].sort((a, b) => {
        const aAt = a.last_event_at ?? ''
        const bAt = b.last_event_at ?? ''
        return bAt.localeCompare(aAt)
      })

      return {
        kind: 'success',
        data: {
          filePath,
          tasks: sorted.map((t) => ({
            id: t.id,
            status: t.status,
            ...(t.title !== undefined ? { title: t.title } : {}),
            ...(t.body !== undefined ? { body: t.body } : {}),
            ...(t.source_refs !== undefined ? { source_refs: t.source_refs } : {}),
            ...(t.deliverable !== undefined ? { deliverable: t.deliverable } : {}),
            ...(t.created_at !== undefined ? { created_at: t.created_at } : {}),
            ...(t.last_event_at !== undefined ? { last_event_at: t.last_event_at } : {}),
            ...(t.runs.size > 0 ? { runs: Array.from(t.runs) } : {}),
          })),
          total_events: totalEvents,
        },
      }
    },
  })
}
