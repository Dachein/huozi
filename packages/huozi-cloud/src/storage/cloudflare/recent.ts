/**
 * GET /events/recent?limit=N
 *
 * UI-facing helper that returns the most recent commits for the caller's
 * workspace, flattened into one row per (commit, path). Consumers render this
 * as a "recently edited" list in the sidebar. Scope-filtered for the caller.
 *
 * Not an MCP tool — it's a read-only convenience for the Web UI. Agents that
 * want similar data use `huozi_history` with a specific path (or glob first).
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'

interface CommitRow {
  commit_sha: string
  parent_sha: string | null
  author_id: string
  author_type: string
  message: string
  timestamp: number
  paths_json: string
}

interface PathEntry {
  path: string
  operation: string
  before_blob_sha: string | null
  after_blob_sha: string | null
}

export interface RecentEntry {
  path: string
  operation: string
  commit_sha: string
  timestamp: number
  author: { id: string; type: 'user' | 'agent' | 'system' }
  message: string
  in_batch: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

export async function handleRecent(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  const p = auth.principal
  const url = new URL(request.url)
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT

  // Pull a few more commits than requested so scope filtering + batch
  // flattening still produces `limit` entries without a second round-trip.
  const commitCap = Math.min(MAX_LIMIT * 2, limit * 3 + 5)

  const { results } = await env.DB.prepare(
    `SELECT commit_sha, parent_sha, author_id, author_type, message, timestamp, paths_json
     FROM commits
     WHERE workspace_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
  )
    .bind(p.workspaceId, commitCap)
    .all<CommitRow>()

  const scope = p.scopePath
  const entries: RecentEntry[] = []

  for (const c of results ?? []) {
    let paths: PathEntry[]
    try {
      paths = JSON.parse(c.paths_json) as PathEntry[]
    } catch {
      continue
    }
    const visible = scope
      ? paths.filter(
          (pe) => pe.path === scope || pe.path.startsWith(scope + '/'),
        )
      : paths
    if (visible.length === 0) continue

    const authorType: 'user' | 'agent' | 'system' =
      c.author_type === 'user'
        ? 'user'
        : c.author_type === 'system'
          ? 'system'
          : 'agent'

    // Flatten: one row per (commit, path) so the UI can render a simple list
    // ordered by timestamp. Stable tie-break is the path itself.
    for (const pe of visible) {
      entries.push({
        path: scope ? relativeToScope(pe.path, scope) : pe.path,
        operation: pe.operation,
        commit_sha: c.commit_sha,
        timestamp: c.timestamp,
        author: { id: c.author_id, type: authorType },
        message: c.message,
        in_batch: visible.length,
      })
      if (entries.length >= limit * 2) break
    }
    if (entries.length >= limit) break
  }

  // Return only `limit` items — the user-facing cap.
  return Response.json({
    ok: true,
    entries: entries.slice(0, limit),
  })
}

function relativeToScope(path: string, scope: string): string {
  if (path === scope) return '.'
  const prefix = scope + '/'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
