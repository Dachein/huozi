/**
 * Server-side thin wrappers around the project-lifecycle MCP tools.
 *
 * These exist for two reasons:
 *   - Route handlers (`/api/app/project/*`) need to invoke the tools
 *     under the request's cookie-resolved api_key.
 *   - The Folder Settings server component reads sentinel + memory +
 *     tasks files; centralising the "is this an upgraded Project?"
 *     check here keeps that page out of the MCP plumbing weeds.
 *
 * Everything here imports `cookies()` indirectly via `mcp-client.ts`
 * so it's runtime-server-only. Do not import this from a "use client"
 * file.
 */

import { callTool, cloudRead, type McpResult } from './mcp-client'

const SENTINEL_SUFFIX = '/.huozi/memory.jsonl'

export interface ProjectStatus {
  folder: string
  isProject: boolean
  /** Top-level slot under `.archive/<folder>/` already has files. */
  isArchived: boolean
  taskCount: number
  memoryCount: number
}

interface UpgradeData {
  folder_path: string
  paths_written: string[]
  commit_sha: string
  readme_existed: boolean
}

interface ArchiveData {
  from: string
  to: string
  commit_sha: string
  moved_paths: number
}

interface TaskCreateData {
  filePath: string
  task_id: string
  at: string
  commit_sha: string
  new_blob_sha: string
}

interface MemoryListData {
  filePath: string
  records: Array<{ id: string; type: string }>
  total_events: number
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

export async function fetchProjectStatus(
  key: string,
  folder: string,
): Promise<ProjectStatus> {
  const status: ProjectStatus = {
    folder,
    isProject: false,
    isArchived: false,
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

  if (tasksFile.ok && tasksFile.data.file?.content) {
    status.taskCount = countDistinctIds(tasksFile.data.file.content)
  }

  if (status.isProject) {
    const mem = await callTool<MemoryListData>(key, 'huozi_memory_list', {
      project_path: folder,
    })
    if (mem.ok) status.memoryCount = mem.data.records.length
  }

  return status
}

export function projectUpgrade(
  key: string,
  folder_path: string,
  readme_content?: string,
): Promise<McpResult<UpgradeData>> {
  return callTool<UpgradeData>(key, 'huozi_project_upgrade', {
    folder_path,
    ...(readme_content ? { readme_content } : {}),
  })
}

export function projectArchive(
  key: string,
  folder_path: string,
): Promise<McpResult<ArchiveData>> {
  return callTool<ArchiveData>(key, 'huozi_project_archive', { folder_path })
}

export function projectUnarchive(
  key: string,
  folder_path: string,
): Promise<McpResult<ArchiveData>> {
  return callTool<ArchiveData>(key, 'huozi_project_unarchive', { folder_path })
}

export function projectTaskCreate(
  key: string,
  project_path: string,
  title: string,
  options?: {
    deliverable?: string
    body?: string
    source_refs?: string[]
  },
): Promise<McpResult<TaskCreateData>> {
  return callTool<TaskCreateData>(key, 'huozi_task_create', {
    project_path,
    title,
    ...(options?.deliverable ? { deliverable: options.deliverable } : {}),
    ...(options?.body ? { body: options.body } : {}),
    ...(options?.source_refs ? { source_refs: options.source_refs } : {}),
  })
}
