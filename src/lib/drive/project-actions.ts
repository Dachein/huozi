/**
 * Server-side wrappers for the Folder Settings page.
 *
 * Project lifecycle (upgrade / archive / unarchive) is deliberately OFF
 * the MCP surface — agents shouldn't auto-mutate Project boundaries.
 * Calls go to the Bearer-auth `/me/project` endpoint on the Worker,
 * which dispatches to pure functions in
 * `packages/huozi-cloud/src/lib/project-actions.ts`.
 *
 * Everything here is runtime-server-only — do not import from a
 * "use client" file.
 */

import { cloudFetch } from '@/lib/cloud-fetch'
import { cloudRead } from './mcp-client'

const SENTINEL_SUFFIX = '/.huozi/memory.md'

export interface ProjectStatus {
  folder: string
  isProject: boolean
  /** Top-level slot under `.archive/<folder>/` already has files. */
  isArchived: boolean
  /** Tasks is opt-in per-Project. True iff memory.md frontmatter declares
   *  `tasks_enabled: true`. Legacy projects upgraded before this flag
   *  shipped read as false even when tasks.jsonl is on disk — users must
   *  click Enable on the Settings page to bring Tasks back. */
  isTasksEnabled: boolean
  taskCount: number
  memoryCount: number
}

interface UpgradeData {
  folder_path: string
  paths_written: string[]
  commit_sha: string
  readme_existed: boolean
}

interface EnableTasksData {
  folder_path: string
  paths_written: string[]
  commit_sha: string
  tasks_already_existed: boolean
}

interface ArchiveData {
  from: string
  to: string
  commit_sha: string
  moved_paths: number
}

/**
 * Quick distinct-id counter over a JSONL file's `id` field. Used for
 * Tasks counting (single-file Collection) and any other entity-streams
 * we eventually surface in Settings.
 */
function countDistinctIds(text: string): number {
  const ids = new Set<string>()
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
    if (typeof e.id === 'string' && e.id.length > 0) {
      ids.add(e.id)
    }
  }
  return ids.size
}

/**
 * Count entries in a `.huozi/memory.md` document. Each entry is a
 * `## <name>` H2 section; the seed template contains no entries so a
 * fresh file returns 0. We intentionally count only real entries —
 * the H1 ("# Project Memory") and any blockquote / HTML comment
 * boilerplate are filtered out.
 */
function countMemoryEntries(text: string): number {
  let count = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) count++
  }
  return count
}

function readTasksEnabledFromMemory(memoryContent: string): boolean {
  // Mirror of `readTasksEnabled` in `packages/huozi-cloud/src/lib/project-actions.ts`.
  // Kept inline (not imported) to avoid pulling worker-only deps into the
  // Next.js bundle. If the format changes, update both sides together.
  const fmMatch = /^(?:﻿)?---\n([\s\S]*?)\n---/.exec(memoryContent)
  if (!fmMatch) return false
  const m = /(^|\n)\s*tasks_enabled\s*:\s*([^\n]+)/.exec(fmMatch[1])
  if (!m) return false
  return m[2].trim().toLowerCase() === 'true'
}

export async function fetchProjectStatus(
  key: string,
  folder: string,
): Promise<ProjectStatus> {
  const status: ProjectStatus = {
    folder,
    isProject: false,
    isArchived: false,
    isTasksEnabled: false,
    taskCount: 0,
    memoryCount: 0,
  }

  // Sentinel check — also covers isArchived via the .archive/<folder> path.
  const [sentinel, archivedSentinel, tasksFile] = await Promise.all([
    cloudRead(key, `${folder}${SENTINEL_SUFFIX}`),
    cloudRead(key, `.archive/${folder}${SENTINEL_SUFFIX}`),
    cloudRead(key, `${folder}/tasks.jsonl`),
  ])

  // cloudRead returns `ok: true` with type "file_unchanged" on second hit;
  // missing files return ok:false with errorCode 4 (FILE_NOT_FOUND).
  status.isProject = sentinel.ok
  status.isArchived = archivedSentinel.ok

  if (status.isProject && sentinel.ok && sentinel.data.file?.content) {
    const memText = sentinel.data.file.content
    status.memoryCount = countMemoryEntries(memText)
    status.isTasksEnabled = readTasksEnabledFromMemory(memText)
  }

  if (status.isTasksEnabled && tasksFile.ok && tasksFile.data.file?.content) {
    status.taskCount = countDistinctIds(tasksFile.data.file.content)
  }

  return status
}

// ── Project lifecycle (Bearer /me/project, not MCP) ──────────────────

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

async function meProjectAction<T>(
  key: string,
  body: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const res = await cloudFetch('/me/project', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // fall through to status-based handling
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error?: unknown }).error)
        : null) ?? `HTTP ${res.status}`
    return { ok: false, status: res.status, message: msg }
  }
  return { ok: true, data: parsed as T }
}

export function projectUpgrade(
  key: string,
  folder_path: string,
  readme_content?: string,
): Promise<ActionResult<UpgradeData>> {
  return meProjectAction<UpgradeData>(key, {
    action: 'upgrade',
    folder_path,
    ...(readme_content ? { readme_content } : {}),
  })
}

export function projectArchive(
  key: string,
  folder_path: string,
): Promise<ActionResult<ArchiveData>> {
  return meProjectAction<ArchiveData>(key, {
    action: 'archive',
    folder_path,
  })
}

export function projectUnarchive(
  key: string,
  folder_path: string,
): Promise<ActionResult<ArchiveData>> {
  return meProjectAction<ArchiveData>(key, {
    action: 'unarchive',
    folder_path,
  })
}

export function projectEnableTasks(
  key: string,
  folder_path: string,
): Promise<ActionResult<EnableTasksData>> {
  return meProjectAction<EnableTasksData>(key, {
    action: 'enable_tasks',
    folder_path,
  })
}

