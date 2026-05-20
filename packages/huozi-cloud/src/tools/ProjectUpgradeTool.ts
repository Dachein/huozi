/**
 * huozi_project_upgrade — promote a regular top-level folder into a
 * Project in one atomic commit.
 *
 * Per spec `dev/2026-05-20-project-folder-structure.md` §1.2, §3.3 v3.3:
 *   - Eager-create three artifacts together: README.md (with `huozi:
 *     project` frontmatter), tasks.jsonl (TASK schema header), and
 *     `.huozi/memory.jsonl` (memory schema header).
 *   - The whole upgrade is one atomic commit via writeBatch — partial
 *     state ("README inserted, memory missing") is never observable.
 *   - If README already exists, we DO NOT touch its body. We only
 *     insert / merge the `huozi: project` frontmatter at the top.
 *   - Nested folders are not Projects; only top-level folders qualify.
 *   - Reserved names (`.archive`, `__assets__`, `.huozi`) are rejected.
 *
 * The Project picker / Settings UI calls this when the user clicks
 * "Upgrade to Project". The same tool also runs the backfill flow
 * (P1.5) by being invoked for every legacy folder that has a README
 * but no sentinel.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import { isProject } from '../lib/project.js'
import {
  buildInitialMemorySchemaLine,
  MEMORY_SCHEMA,
} from '../storage/collection-schemas/memory.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const PROJECT_UPGRADE_TOOL_NAME = 'huozi_project_upgrade'

// ── Input / output ────────────────────────────────────────────────────

export const projectUpgradeInputSchema = z.object({
  folder_path: z.string().min(1).describe(
    'Name of the top-level folder to upgrade (e.g. "huozi-dev"). Must not contain `/`. Must not be a reserved system name (.archive / __assets__ / .huozi).',
  ),
  readme_content: z.string().optional().describe(
    'Optional body for a brand-new README.md. Ignored if README already exists. If omitted, a minimal one-liner stub is used. The `huozi: project` frontmatter is inserted on top either way.',
  ),
})

export type ProjectUpgradeInput = z.infer<typeof projectUpgradeInputSchema>

export const projectUpgradeOutputSchema = z.object({
  folder_path: z.string(),
  paths_written: z.array(z.string()),
  commit_sha: z.string(),
  /** True if README pre-existed and we only injected frontmatter. */
  readme_existed: z.boolean(),
})

export type ProjectUpgradeOutput = z.infer<typeof projectUpgradeOutputSchema>

// ── Frontmatter helpers ───────────────────────────────────────────────

const HUOZI_FRONTMATTER_KEY = 'huozi'
const HUOZI_FRONTMATTER_VALUE = 'project'

/**
 * Detect a YAML frontmatter block at the top of a markdown file. We
 * accept the common GitHub-style fence: `---\n...\n---\n` as the first
 * thing in the file. Anything before the opening `---` (BOM aside)
 * disqualifies the block — we treat it as "no frontmatter".
 *
 * Returns the inner text (between the fences) plus the index after
 * the closing fence's newline, or null when there's no block.
 */
function detectFrontmatter(
  text: string,
): { inner: string; bodyStart: number } | null {
  let i = 0
  if (text.startsWith('\uFEFF')) i = 1 // BOM
  if (!text.startsWith('---', i)) return null
  // The line `---` (open) must be at position i and followed by \n or
  // \r\n.
  const afterOpen = i + 3
  if (text[afterOpen] !== '\n') return null
  const innerStart = afterOpen + 1
  // Look for a closing `---` line: a `\n---\n` (or `\n---` at end).
  // We rely on simple substring search — frontmatter blocks are tiny.
  const closeIdx = text.indexOf('\n---', innerStart)
  if (closeIdx === -1) return null
  const afterClose = closeIdx + 4
  // The `---` must be followed by end-of-file OR a newline (so trailing
  // `---x` doesn't match).
  if (afterClose < text.length && text[afterClose] !== '\n') return null
  const bodyStart = afterClose < text.length ? afterClose + 1 : afterClose
  const inner = text.slice(innerStart, closeIdx)
  return { inner, bodyStart }
}

/**
 * Insert (or merge) `huozi: project` into the README content. Returns
 * the new content. Idempotent — if the key already says `project`, the
 * content is returned unchanged.
 */
export function ensureHuoziFrontmatter(content: string): string {
  const fm = detectFrontmatter(content)
  if (fm) {
    // Check for the existing huozi: line.
    const hasHuoziLine = /(^|\n)\s*huozi\s*:\s*\S+\s*(\n|$)/.test(fm.inner)
    if (hasHuoziLine) {
      // Replace any existing `huozi:` value with `project`.
      const replaced = fm.inner.replace(
        /(^|\n)(\s*huozi\s*:\s*)([^\n]*)/,
        (_m, prefix: string, key: string) => `${prefix}${key}${HUOZI_FRONTMATTER_VALUE}`,
      )
      if (replaced === fm.inner) return content
      return (
        content.slice(0, content.indexOf(fm.inner)) +
        replaced +
        content.slice(content.indexOf(fm.inner) + fm.inner.length)
      )
    }
    // Inject huozi: project at the top of the existing block.
    const injected = `${HUOZI_FRONTMATTER_KEY}: ${HUOZI_FRONTMATTER_VALUE}\n${fm.inner.startsWith('\n') ? fm.inner.slice(1) : fm.inner}`
    // Reconstruct: BOM (if any) + opening fence + injected + closing fence + body
    const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
    return `${bom}---\n${injected}\n---\n${content.slice(fm.bodyStart)}`
  }
  // No existing frontmatter — prepend a new minimal one.
  return `---\n${HUOZI_FRONTMATTER_KEY}: ${HUOZI_FRONTMATTER_VALUE}\n---\n${content}`
}

function defaultReadmeBody(folderName: string): string {
  return `# ${folderName}\n\n_This folder is a huozi Project. Document its goal, owners, and conventions here._\n`
}

// Task schema header for tasks.jsonl — duplicated minimally from
// `src/lib/tasks/schema.ts` CANONICAL_TASK_SCHEMA to avoid forcing the
// worker to import webapp code. The renderer reads the file's first
// schema event, so a slightly skinnier shape is enough to bootstrap.
const TASKS_SCHEMA_LINE = JSON.stringify({
  op: 'schema',
  at: '__PLACEHOLDER__',
  by: 'system',
  version: 1,
  schema: {
    title: 'Tasks',
    entity: {
      title_field: 'subject',
      subtitle_field: 'from',
      avatar_field: 'source_icon',
    },
    fields: {
      subject: { type: 'text', label: 'Subject', display: 'headline', searchable: true },
      from: { type: 'email', label: 'From', display: 'subheadline' },
      source: {
        type: 'select',
        label: 'Source',
        display: 'aside',
        filterable: true,
        options: [
          { value: 'email', label: 'Email' },
          { value: 'webhook', label: 'Webhook' },
          { value: 'manual', label: 'Manual' },
          { value: 'slack', label: 'Slack' },
        ],
      },
      status: {
        type: 'select',
        label: 'Status',
        display: 'aside',
        filterable: true,
        options: [
          { value: 'pending', label: 'Pending', color: 'gray' },
          { value: 'working', label: 'Working', color: 'blue' },
          { value: 'awaiting_user', label: 'Awaiting', color: 'amber' },
          { value: 'done', label: 'Done', color: 'green' },
          { value: 'archived', label: 'Archived', color: 'slate' },
        ],
      },
      body: { type: 'richtext', label: 'Body', display: 'body' },
    },
    list_view: {
      filters: ['status', 'source'],
      search: ['subject', 'from', 'body'],
      sort: '-_updated_at',
      row: {
        title: 'subject',
        status: 'status',
        timestamp: '_updated_at',
        subtitle: 'from',
        preview: 'body',
      },
    },
  },
})

function buildTasksSchemaLine(at: string): string {
  return TASKS_SCHEMA_LINE.replace('"__PLACEHOLDER__"', JSON.stringify(at))
}

// ── Deps + reserved-name guard ────────────────────────────────────────

export interface ProjectUpgradeToolDeps {
  storage: StorageBackend
}

const RESERVED_FOLDER_NAMES = new Set([
  '.archive',
  '__assets__',
  '.huozi',
])

function looksLikeTopLevelName(name: string): boolean {
  if (name.length === 0) return false
  if (name.includes('/')) return false
  if (name === '.' || name === '..') return false
  return true
}

export function projectUpgradePrompt(): string {
  return `Upgrade a top-level folder into a huozi Project (one atomic commit).

Usage:
- \`folder_path\` is the bare name of a top-level folder (e.g. "huozi-dev"). No slashes; not a reserved system name (.archive / __assets__ / .huozi).
- The Upgrade flow mints three files in a single commit:
    1. README.md — if it already exists, we ONLY insert \`huozi: project\` into its YAML frontmatter (body untouched). If missing, we create a minimal stub.
    2. tasks.jsonl — single-file Tasks Collection seeded with the canonical TASK schema as the first event.
    3. .huozi/memory.jsonl — agent memory file seeded with the memory schema as the first event. Existence of this file is the Project sentinel.
- Fails if the folder is already an upgraded Project (sentinel exists), or the folder name is reserved.
- Optional \`readme_content\` provides the body for a fresh README. Ignored when README already exists.

Example:
{
  "folder_path": "marketing"
}

Returns the list of paths written and the commit sha.`
}

// ── Tool ──────────────────────────────────────────────────────────────

export function createProjectUpgradeTool(
  deps: ProjectUpgradeToolDeps,
): Tool<ProjectUpgradeInput, ProjectUpgradeOutput> {
  // Reference MEMORY_SCHEMA so a renaming refactor in the schema file
  // is flagged here (TS would otherwise miss it — the seed line is
  // produced by buildInitialMemorySchemaLine).
  void MEMORY_SCHEMA
  return buildTool<ProjectUpgradeInput, ProjectUpgradeOutput>({
    name: PROJECT_UPGRADE_TOOL_NAME,
    userFacingName: 'ProjectUpgrade',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: projectUpgradeInputSchema,
    outputSchema: projectUpgradeOutputSchema,
    async description() {
      return 'Upgrade a top-level folder into a Project — atomic 3-file commit.'
    },
    async prompt() {
      return projectUpgradePrompt()
    },
    renderResult(data) {
      const action = data.readme_existed
        ? 'Inserted huozi:project frontmatter into existing README; created tasks.jsonl + .huozi/memory.jsonl'
        : 'Created README.md + tasks.jsonl + .huozi/memory.jsonl'
      return `✓ Upgraded "${data.folder_path}" to Project. ${action}. (commit ${data.commit_sha.slice(0, 8)})`
    },

    async validateInput(input) {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { result: false, errorCode: ERR.INVALID_URI, message: canon.message }
      }
      if (!looksLikeTopLevelName(canon.path)) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message:
            'folder_path must be a single top-level folder name, not a path. Nested projects are not supported.',
        }
      }
      if (RESERVED_FOLDER_NAMES.has(canon.path)) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message: `"${canon.path}" is a reserved system folder name and cannot be upgraded.`,
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<ProjectUpgradeOutput>> {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const folder = canon.path

      const already = await isProject(deps.storage, ctx.workspaceId, folder)
      if (already) {
        return {
          kind: 'error',
          errorCode: ERR.CANNOT_CREATE_FILE_EXISTS,
          message: `"${folder}" is already an upgraded Project (sentinel ${folder}/.huozi/memory.jsonl exists).`,
        }
      }

      const at = new Date().toISOString()

      // README handling — branch on existence.
      const readmePath = `${folder}/README.md`
      const existingReadme = await deps.storage.readFile(ctx.workspaceId, readmePath)
      let readmeContent: string
      let readmeParent: string | null
      if (existingReadme) {
        const text = new TextDecoder().decode(existingReadme.content)
        readmeContent = ensureHuoziFrontmatter(text)
        readmeParent = existingReadme.blob_sha
      } else {
        const body = input.readme_content ?? defaultReadmeBody(folder)
        readmeContent = ensureHuoziFrontmatter(body)
        readmeParent = null
      }

      const tasksPath = `${folder}/tasks.jsonl`
      const memoryPath = `${folder}/.huozi/memory.jsonl`

      const encoder = new TextEncoder()
      const edits = [
        {
          path: readmePath,
          content: encoder.encode(readmeContent),
          parent_sha: readmeParent,
        },
        {
          path: tasksPath,
          content: encoder.encode(buildTasksSchemaLine(at) + '\n'),
          parent_sha: null as string | null,
        },
        {
          path: memoryPath,
          content: encoder.encode(buildInitialMemorySchemaLine({ at }) + '\n'),
          parent_sha: null as string | null,
        },
      ]

      const result = await deps.storage.writeBatch({
        workspaceId: ctx.workspaceId,
        author: { id: ctx.principalId, type: ctx.principalType },
        edits,
        allOrNothing: true,
        message: `project_upgrade: ${folder}`,
      })

      if (result.aborted || result.commit_sha === null) {
        const firstError = result.results.find((r) => !r.success)?.error
        return {
          kind: 'error',
          errorCode: ERR.CONFLICT,
          message:
            firstError
              ? `Project upgrade aborted: ${firstError.message}`
              : 'Project upgrade aborted (writeBatch returned no commit).',
        }
      }

      // Refresh the per-session read cache so subsequent Edit on any
      // of the three files works without an explicit Read first.
      for (const r of result.results) {
        if (r.success && r.record) {
          ctx.readFileState.set(r.path, {
            blob_sha: r.record.blob_sha,
            offset: undefined,
            limit: undefined,
            readAt: Date.now(),
          })
        }
      }

      return {
        kind: 'success',
        data: {
          folder_path: folder,
          paths_written: [readmePath, tasksPath, memoryPath],
          commit_sha: result.commit_sha,
          readme_existed: existingReadme !== null,
        },
      }
    },
  })
}
