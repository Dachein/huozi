/**
 * Project lifecycle actions — pure functions invoked by `/me/project`.
 *
 * Per the v3.3 decision to make Project upgrade / archive / unarchive
 * USER-driven (not agent-driven), the logic lives here as plain
 * `(storage, principal, input) → result` functions. The MCP layer
 * does not expose them; the only entry point is the Bearer-auth
 * `/me/project` REST endpoint that the Web Settings page calls.
 *
 * Atomicity is preserved via `storage.writeBatch` for upgrade and
 * `storage.renamePrefix` for archive/unarchive — partial state ("README
 * inserted, memory missing", "half-moved folder") is never observable.
 *
 * Reserved name rules (shared across all three actions):
 *   - Cannot upgrade / archive `.archive` itself (would self-nest).
 *   - Cannot upgrade / archive system folders (`__assets__`, `.huozi`).
 *   - Project upgrade refuses already-upgraded folders (sentinel exists).
 *   - Archive refuses when `.archive/<name>/` is already occupied.
 *   - Unarchive refuses when the top-level slot is already occupied.
 */

import { isProject } from './project.js'
import { INITIAL_MEMORY_DOC } from '../storage/collection-schemas/memory.js'
import type { Author, StorageBackend } from '../storage/types.js'

const ARCHIVE_PREFIX = '.archive/'
const RESERVED_NAMES = new Set(['.archive', '__assets__', '.huozi'])

// ── Common helpers ────────────────────────────────────────────────────

function looksLikeTopLevelName(name: string): boolean {
  if (name.length === 0) return false
  if (name.includes('/')) return false
  if (name === '.' || name === '..') return false
  return true
}

async function folderHasAnyFile(
  storage: StorageBackend,
  workspaceId: string,
  prefix: string,
): Promise<boolean> {
  const entries = await storage.listFiles(workspaceId, { prefix, limit: 1 })
  return entries.length > 0
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

// ── Upgrade ───────────────────────────────────────────────────────────

const HUOZI_FRONTMATTER_KEY = 'huozi'
const HUOZI_FRONTMATTER_VALUE = 'project'

function detectFrontmatter(
  text: string,
): { inner: string; bodyStart: number } | null {
  let i = 0
  if (text.startsWith('\uFEFF')) i = 1
  if (!text.startsWith('---', i)) return null
  const afterOpen = i + 3
  if (text[afterOpen] !== '\n') return null
  const innerStart = afterOpen + 1
  const closeIdx = text.indexOf('\n---', innerStart)
  if (closeIdx === -1) return null
  const afterClose = closeIdx + 4
  if (afterClose < text.length && text[afterClose] !== '\n') return null
  const bodyStart = afterClose < text.length ? afterClose + 1 : afterClose
  const inner = text.slice(innerStart, closeIdx)
  return { inner, bodyStart }
}

/**
 * Insert or merge `huozi: project` into the README content's YAML
 * frontmatter block. Idempotent: re-running on an already-stamped
 * README returns the input unchanged.
 */
export function ensureHuoziFrontmatter(content: string): string {
  const fm = detectFrontmatter(content)
  if (fm) {
    const hasHuoziLine = /(^|\n)\s*huozi\s*:\s*\S+\s*(\n|$)/.test(fm.inner)
    if (hasHuoziLine) {
      const replaced = fm.inner.replace(
        /(^|\n)(\s*huozi\s*:\s*)([^\n]*)/,
        (_m, prefix: string, key: string) =>
          `${prefix}${key}${HUOZI_FRONTMATTER_VALUE}`,
      )
      if (replaced === fm.inner) return content
      return (
        content.slice(0, content.indexOf(fm.inner)) +
        replaced +
        content.slice(content.indexOf(fm.inner) + fm.inner.length)
      )
    }
    const injected = `${HUOZI_FRONTMATTER_KEY}: ${HUOZI_FRONTMATTER_VALUE}\n${fm.inner.startsWith('\n') ? fm.inner.slice(1) : fm.inner}`
    const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
    return `${bom}---\n${injected}\n---\n${content.slice(fm.bodyStart)}`
  }
  return `---\n${HUOZI_FRONTMATTER_KEY}: ${HUOZI_FRONTMATTER_VALUE}\n---\n${content}`
}

function defaultReadmeBody(folderName: string): string {
  return `# ${folderName}\n\n_This folder is a huozi Project. Document its goal, owners, and conventions here._\n`
}

// Canonical Tasks schema baked into the seed event. Mirrors
// `CANONICAL_TASK_SCHEMA` in `app/src/lib/tasks/schema.ts`; the renderer
// reads the file's first schema event so the bootstrap shape just has to
// be valid enough to bring up the standard list/detail view.
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

export interface UpgradeInput {
  folderPath: string
  readmeContent?: string
}

export interface UpgradeData {
  folder_path: string
  paths_written: string[]
  commit_sha: string
  readme_existed: boolean
}

export async function upgradeProject(
  storage: StorageBackend,
  workspaceId: string,
  author: Author,
  input: UpgradeInput,
): Promise<ActionResult<UpgradeData>> {
  const folder = input.folderPath
  if (!looksLikeTopLevelName(folder)) {
    return {
      ok: false,
      status: 400,
      message:
        'folder_path must be a single top-level folder name. Nested projects are not supported.',
    }
  }
  if (RESERVED_NAMES.has(folder)) {
    return {
      ok: false,
      status: 400,
      message: `"${folder}" is a reserved system folder name and cannot be upgraded.`,
    }
  }

  const already = await isProject(storage, workspaceId, folder)
  if (already) {
    return {
      ok: false,
      status: 409,
      message: `"${folder}" is already an upgraded Project (sentinel ${folder}/.huozi/memory.md exists).`,
    }
  }

  const at = new Date().toISOString()

  const readmePath = `${folder}/README.md`
  const existingReadme = await storage.readFile(workspaceId, readmePath)
  let readmeContent: string
  let readmeParent: string | null
  if (existingReadme) {
    const text = new TextDecoder().decode(existingReadme.content)
    readmeContent = ensureHuoziFrontmatter(text)
    readmeParent = existingReadme.blob_sha
  } else {
    const body = input.readmeContent ?? defaultReadmeBody(folder)
    readmeContent = ensureHuoziFrontmatter(body)
    readmeParent = null
  }

  const memoryPath = `${folder}/.huozi/memory.md`

  // Tasks is opt-in: upgrade no longer mints tasks.jsonl. Users explicitly
  // enable Tasks per-project via `enableTasks` (POST /me/project
  // {action: 'enable_tasks'}). README + memory remain mandatory — they
  // define the Project itself.
  const encoder = new TextEncoder()
  const edits = [
    {
      path: readmePath,
      content: encoder.encode(readmeContent),
      parent_sha: readmeParent,
    },
    {
      path: memoryPath,
      content: encoder.encode(INITIAL_MEMORY_DOC),
      parent_sha: null as string | null,
    },
  ]

  const result = await storage.writeBatch({
    workspaceId,
    author,
    edits,
    allOrNothing: true,
    message: `project_upgrade: ${folder}`,
  })
  if (result.aborted || result.commit_sha === null) {
    const firstError = result.results.find((r) => !r.success)?.error
    return {
      ok: false,
      status: 409,
      message: firstError
        ? `Project upgrade aborted: ${firstError.message}`
        : 'Project upgrade aborted (writeBatch returned no commit).',
    }
  }

  return {
    ok: true,
    data: {
      folder_path: folder,
      paths_written: [readmePath, memoryPath],
      commit_sha: result.commit_sha,
      readme_existed: existingReadme !== null,
    },
  }
}

// ── Enable Tasks ──────────────────────────────────────────────────────

/** Read the `tasks_enabled` frontmatter flag from a memory.md body.
 *  Missing key, malformed frontmatter, or any value other than the
 *  literal string `true` all yield `false`. Legacy projects upgraded
 *  before Tasks-opt-in shipped therefore read as `false` and require
 *  an explicit Enable click. */
export function readTasksEnabled(memoryContent: string): boolean {
  const fm = detectFrontmatter(memoryContent)
  if (!fm) return false
  const m = /(^|\n)\s*tasks_enabled\s*:\s*([^\n]+)/.exec(fm.inner)
  if (!m || m[2] === undefined) return false
  return m[2].trim().toLowerCase() === 'true'
}

/** Insert or replace `tasks_enabled: true` in a memory.md body's
 *  frontmatter. Always operates on an existing frontmatter block —
 *  every project memory.md starts with one (the sentinel template) —
 *  and is idempotent when the flag is already set. */
export function setTasksEnabled(memoryContent: string): string {
  const fm = detectFrontmatter(memoryContent)
  if (!fm) {
    return `---\nhuozi: project-memory\ntasks_enabled: true\n---\n${memoryContent}`
  }
  if (/(^|\n)\s*tasks_enabled\s*:/.test(fm.inner)) {
    const replaced = fm.inner.replace(
      /(^|\n)(\s*tasks_enabled\s*:\s*)([^\n]*)/,
      (_m, prefix: string, key: string) => `${prefix}${key}true`,
    )
    if (replaced === fm.inner) return memoryContent
    return (
      memoryContent.slice(0, memoryContent.indexOf(fm.inner)) +
      replaced +
      memoryContent.slice(memoryContent.indexOf(fm.inner) + fm.inner.length)
    )
  }
  const injected = `${fm.inner.replace(/\n*$/, '')}\ntasks_enabled: true\n`
  const bom = memoryContent.startsWith('﻿') ? '﻿' : ''
  return `${bom}---\n${injected}---\n${memoryContent.slice(fm.bodyStart)}`
}

export interface EnableTasksData {
  folder_path: string
  paths_written: string[]
  commit_sha: string
  tasks_already_existed: boolean
}

/**
 * Flip the project's `tasks_enabled` flag to true and seed `tasks.jsonl`
 * if it doesn't already exist. Idempotent: re-running on an
 * already-enabled project returns success with no commit. One-way: there
 * is no `disableTasks` counterpart by design — see the Project model
 * comment in this file's header.
 */
export async function enableTasks(
  storage: StorageBackend,
  workspaceId: string,
  author: Author,
  folderPath: string,
): Promise<ActionResult<EnableTasksData>> {
  if (!looksLikeTopLevelName(folderPath)) {
    return {
      ok: false,
      status: 400,
      message:
        'folder_path must be a single top-level folder name. Nested projects are not supported.',
    }
  }
  if (RESERVED_NAMES.has(folderPath)) {
    return {
      ok: false,
      status: 400,
      message: `"${folderPath}" is a reserved system folder name and cannot have Tasks enabled.`,
    }
  }

  const memoryPath = `${folderPath}/.huozi/memory.md`
  const existingMemory = await storage.readFile(workspaceId, memoryPath)
  if (!existingMemory) {
    return {
      ok: false,
      status: 404,
      message: `"${folderPath}" is not an upgraded Project (no ${memoryPath}). Upgrade first.`,
    }
  }

  const decoder = new TextDecoder()
  const currentMemoryText = decoder.decode(existingMemory.content)
  const alreadyEnabled = readTasksEnabled(currentMemoryText)

  const tasksPath = `${folderPath}/tasks.jsonl`
  const existingTasks = await storage.readFile(workspaceId, tasksPath)

  if (alreadyEnabled && existingTasks !== null) {
    return {
      ok: true,
      data: {
        folder_path: folderPath,
        paths_written: [],
        commit_sha: existingMemory.blob_sha,
        tasks_already_existed: true,
      },
    }
  }

  const encoder = new TextEncoder()
  const at = new Date().toISOString()
  const edits: Array<{
    path: string
    content: Uint8Array
    parent_sha: string | null
  }> = []

  if (!alreadyEnabled) {
    const updated = setTasksEnabled(currentMemoryText)
    edits.push({
      path: memoryPath,
      content: encoder.encode(updated),
      parent_sha: existingMemory.blob_sha,
    })
  }
  if (existingTasks === null) {
    edits.push({
      path: tasksPath,
      content: encoder.encode(buildTasksSchemaLine(at) + '\n'),
      parent_sha: null,
    })
  }

  const result = await storage.writeBatch({
    workspaceId,
    author,
    edits,
    allOrNothing: true,
    message: `project_enable_tasks: ${folderPath}`,
  })
  if (result.aborted || result.commit_sha === null) {
    const firstError = result.results.find((r) => !r.success)?.error
    return {
      ok: false,
      status: 409,
      message: firstError
        ? `Enable Tasks aborted: ${firstError.message}`
        : 'Enable Tasks aborted (writeBatch returned no commit).',
    }
  }

  return {
    ok: true,
    data: {
      folder_path: folderPath,
      paths_written: edits.map((e) => e.path),
      commit_sha: result.commit_sha,
      tasks_already_existed: existingTasks !== null,
    },
  }
}

// ── Archive / Unarchive ───────────────────────────────────────────────

export interface ArchiveData {
  from: string
  to: string
  commit_sha: string
  moved_paths: number
}

export async function archiveProject(
  storage: StorageBackend,
  workspaceId: string,
  author: Author,
  folderPath: string,
): Promise<ActionResult<ArchiveData>> {
  if (!looksLikeTopLevelName(folderPath)) {
    return {
      ok: false,
      status: 400,
      message: 'folder_path must be a single top-level folder name.',
    }
  }
  if (RESERVED_NAMES.has(folderPath)) {
    return {
      ok: false,
      status: 400,
      message: `"${folderPath}" is a reserved system folder and cannot be archived.`,
    }
  }
  const fromPrefix = `${folderPath}/`
  const toPrefix = `${ARCHIVE_PREFIX}${folderPath}/`

  if (!(await folderHasAnyFile(storage, workspaceId, fromPrefix))) {
    return {
      ok: false,
      status: 404,
      message: `No files found under "${fromPrefix}" — nothing to archive.`,
    }
  }
  if (await folderHasAnyFile(storage, workspaceId, toPrefix)) {
    return {
      ok: false,
      status: 409,
      message: `Archive slot "${toPrefix}" is already occupied. Restore or rename the existing archive entry first.`,
    }
  }

  const result = await storage.renamePrefix({
    workspaceId,
    fromPrefix,
    toPrefix,
    author,
    message: `project_archive: ${folderPath}`,
  })
  if (!result.ok) {
    return {
      ok: false,
      status: 409,
      message: `Archive failed: ${result.error}${result.message ? ` (${result.message})` : ''}`,
    }
  }
  return {
    ok: true,
    data: {
      from: fromPrefix,
      to: toPrefix,
      commit_sha: result.commit_sha ?? '',
      moved_paths: result.moved_paths.length,
    },
  }
}

export async function unarchiveProject(
  storage: StorageBackend,
  workspaceId: string,
  author: Author,
  folderPath: string,
): Promise<ActionResult<ArchiveData>> {
  if (!looksLikeTopLevelName(folderPath)) {
    return {
      ok: false,
      status: 400,
      message:
        'folder_path must be the bare archived folder name (no slashes). For .archive/foo/ pass "foo".',
    }
  }
  const fromPrefix = `${ARCHIVE_PREFIX}${folderPath}/`
  const toPrefix = `${folderPath}/`

  if (!(await folderHasAnyFile(storage, workspaceId, fromPrefix))) {
    return {
      ok: false,
      status: 404,
      message: `No archived folder at "${fromPrefix}".`,
    }
  }
  if (await folderHasAnyFile(storage, workspaceId, toPrefix)) {
    return {
      ok: false,
      status: 409,
      message: `Top-level slot "${toPrefix}" is already occupied — restore would overwrite live files.`,
    }
  }

  const result = await storage.renamePrefix({
    workspaceId,
    fromPrefix,
    toPrefix,
    author,
    message: `project_unarchive: ${folderPath}`,
  })
  if (!result.ok) {
    return {
      ok: false,
      status: 409,
      message: `Unarchive failed: ${result.error}${result.message ? ` (${result.message})` : ''}`,
    }
  }
  return {
    ok: true,
    data: {
      from: fromPrefix,
      to: toPrefix,
      commit_sha: result.commit_sha ?? '',
      moved_paths: result.moved_paths.length,
    },
  }
}
