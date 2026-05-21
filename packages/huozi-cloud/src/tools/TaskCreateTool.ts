/**
 * huozi_task_create — create a new Task entity in a Project's
 * single-file tasks Collection.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §5.4 v3.3:
 *   - Tasks live in `<project>/tasks.jsonl`, one file shared by all
 *     tasks in the Project (same Collection shape as inbox.jsonl).
 *   - Each task is identified by `id`; the file is interleaved by
 *     timestamp, the renderer folds by id.
 *   - Promote from inbox: caller passes `source_refs: ["inbox.jsonl#<i_id>"]`
 *     so the inbox event ↔ task linkage is preserved. The inbox file
 *     is NOT modified (v3.3 §4: inbox is pure raw).
 *   - The tool refuses on un-upgraded projects (tasks.jsonl missing)
 *     because the Upgrade flow is the only place that mints the file.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const TASK_CREATE_TOOL_NAME = 'huozi_task_create'

const TASKS_FILE = 'tasks.jsonl'

// ── Input / output ────────────────────────────────────────────────────

export const taskCreateInputSchema = z.object({
  project_path: z.string().min(1).describe(
    'Path to the project folder. The tool appends to <project_path>/tasks.jsonl. Project must be upgraded.',
  ),
  title: z.string().min(1).describe(
    'Short task title — drives the headline in the Tasks list view.',
  ),
  deliverable: z.string().optional().describe(
    'Optional description of what "done" looks like for this task. Stored on the create event.',
  ),
  source_refs: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Optional references this task pulls from. Standard form is "<path>#<entity_id>" — e.g. "inbox.jsonl#i_42" when Promoting from inbox. The inbox file is not modified; the link is one-way.',
    ),
  body: z.string().optional().describe(
    'Optional task body / description for the entity panel. Markdown supported.',
  ),
})

export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>

export const taskCreateOutputSchema = z.object({
  filePath: z.string(),
  task_id: z.string(),
  at: z.string(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
})

export type TaskCreateOutput = z.infer<typeof taskCreateOutputSchema>

// ── Deps ──────────────────────────────────────────────────────────────

export interface TaskCreateToolDeps {
  storage: StorageBackend
}

function tasksFilePath(projectPath: string): string {
  const trimmed = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  return `${trimmed}/${TASKS_FILE}`
}

export function taskCreatePrompt(): string {
  return `Create a new Task in a Project's tasks.jsonl.

Usage:
- \`project_path\` must point at an upgraded Project (sentinel \`.huozi/memory.jsonl\` exists, and the Upgrade flow has already seeded \`tasks.jsonl\`). The tool will NOT auto-create the file.
- \`title\` is required; \`deliverable\` and \`body\` are optional descriptive fields.
- Use \`source_refs\` to tie this task back to the events it came from. The standard form is "<path>#<entity_id>" — e.g. "inbox.jsonl#i_42" when Promoting an inbox event. The referenced files are read-only as far as this tool is concerned (v3.3 §4: inbox is pure raw).
- Generates a fresh UUID v4 task id and appends a single \`op:"create"\` event.

Example (Promote from inbox):
{
  "project_path": "huozi-dev",
  "title": "Reply to Stratechery digest",
  "deliverable": "One short reply, summarizing the AI / data center angle.",
  "source_refs": ["inbox.jsonl#40cf715d-131a-4aaa-9095-3da81efce286"]
}`
}

// ── Tool ──────────────────────────────────────────────────────────────

export function createTaskCreateTool(
  deps: TaskCreateToolDeps,
): Tool<TaskCreateInput, TaskCreateOutput> {
  return buildTool<TaskCreateInput, TaskCreateOutput>({
    name: TASK_CREATE_TOOL_NAME,
    userFacingName: 'TaskCreate',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: taskCreateInputSchema,
    outputSchema: taskCreateOutputSchema,
    async description() {
      return 'Create a new Task entity (op:"create") in a Project\'s tasks.jsonl.'
    },
    async prompt() {
      return taskCreatePrompt()
    },
    renderResult(data) {
      return `✓ Created task ${data.task_id.slice(0, 8)}… in ${data.filePath} (commit ${data.commit_sha.slice(0, 8)}).`
    },

    async call(input, ctx): Promise<ToolResult<TaskCreateOutput>> {
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
            `No tasks file at "${filePath}". The folder "${canon.path}" is not an upgraded Project — ` +
            'run huozi_project_upgrade first.',
        }
      }

      const at = new Date().toISOString()
      const taskId = crypto.randomUUID()
      const by = `${ctx.principalType}:${ctx.principalId}`

      const event: Record<string, unknown> = {
        id: taskId,
        at,
        by,
        op: 'create',
        title: input.title,
      }
      if (input.deliverable !== undefined) event.deliverable = input.deliverable
      if (input.body !== undefined) event.body = input.body
      if (input.source_refs !== undefined && input.source_refs.length > 0) {
        event.source_refs = input.source_refs
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
        message: `task_create: ${taskId} in ${canon.path}`,
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
          task_id: taskId,
          at,
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
        },
      }
    },
  })
}
