/**
 * File "open" tracking — per-principal last-opened timestamps.
 *
 * Distinct from /events/recent (which reads the `commits` log = last *edit*).
 * An open is an explicit UI signal: the client POSTs when a user actually
 * opens/views a file, so Agent reads (huozi_read) never pollute it.
 *
 *   POST /events/open    Bearer <key>   body { file_path }
 *     → upsert (workspace_id, principal_id, path).opened_at = now
 *   GET  /events/opens?limit=N   Bearer <key>
 *     → { ok, entries: [{ path, opened_at }] }   newest first
 *
 * Keyed by principal_id (a user's keys share one principal_id), so "last
 * opened" is per-user and follows them across devices.
 *
 * The table is created lazily at runtime (CREATE TABLE IF NOT EXISTS) because
 * the deploy token lacks D1-management perms (API error 7403); the worker's
 * runtime D1 binding has full DDL access. Mirrored into schema.sql for record.
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500
const MAX_PATH_LEN = 1024

// Per-isolate guard so we don't issue DDL on every request. CREATE ... IF NOT
// EXISTS is idempotent, so a fresh isolate re-running it is harmless.
let tableEnsured = false
async function ensureTable(env: HuoziCloudflareBindings): Promise<void> {
  if (tableEnsured) return
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS file_opens (
       workspace_id TEXT NOT NULL,
       principal_id TEXT NOT NULL,
       path TEXT NOT NULL,
       opened_at INTEGER NOT NULL,
       PRIMARY KEY (workspace_id, principal_id, path)
     )`,
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_file_opens_recent
       ON file_opens (workspace_id, principal_id, opened_at DESC)`,
  ).run()
  tableEnsured = true
}

/**
 * POST /events/open  — record (or refresh) when the caller opened a file.
 */
export async function handleRecordOpen(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
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

  let body: { file_path?: unknown }
  try {
    body = (await request.json()) as { file_path?: unknown }
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  const filePath =
    typeof body.file_path === 'string' ? body.file_path.trim() : ''
  if (!filePath || filePath.length > MAX_PATH_LEN) {
    return Response.json({ error: 'file_path required' }, { status: 400 })
  }

  try {
    await ensureTable(env)
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO file_opens (workspace_id, principal_id, path, opened_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(workspace_id, principal_id, path)
       DO UPDATE SET opened_at = ?4`,
    )
      .bind(p.workspaceId, p.principalId, filePath, now)
      .run()
    return Response.json({ ok: true, opened_at: now })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: 'open_record_failed', message },
      { status: 500 },
    )
  }
}

interface OpenRow {
  path: string
  opened_at: number
}

/**
 * GET /events/opens?limit=N  — the caller's most-recently opened files.
 */
export async function handleRecentOpens(
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

  try {
    await ensureTable(env)
    const { results } = await env.DB.prepare(
      `SELECT path, opened_at FROM file_opens
       WHERE workspace_id = ? AND principal_id = ?
       ORDER BY opened_at DESC
       LIMIT ?`,
    )
      .bind(p.workspaceId, p.principalId, limit)
      .all<OpenRow>()
    return Response.json({ ok: true, entries: results ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: 'opens_read_failed', message },
      { status: 500 },
    )
  }
}
