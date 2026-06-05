/**
 * /me/favorites — per-(workspace, principal) file favorites.
 *
 * UI-facing convenience for the miniapp / web "starred files" list. Like
 * `recent.ts`, this is a plain Bearer-authed Worker endpoint, deliberately
 * NOT an MCP tool — favoriting is a human-surface action, so keeping it off
 * the agent tool list avoids polluting every agent's schema. Mounted under
 * /me/* so it matches an existing cloud.huozi.app route pattern.
 *
 *   GET    /me/favorites                    → list the caller's favorites
 *   POST   /me/favorites  { file_path, favorited? }
 *                                           → add (favorited !== false) or
 *                                             remove (favorited === false)
 *   DELETE /me/favorites?file_path=<path>   → remove
 *
 * Scoped to the issuing principal, so two users sharing a workspace keep
 * independent stars. The api key the miniapp uses for /mcp resolves to the
 * same principal here, so GET and POST stay consistent across surfaces.
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'

const MAX_PATH_LEN = 1024
const LIST_LIMIT = 2000

interface FavoriteRow {
  file_path: string
  created_at: number
}

// Lazily ensure the `favorites` table exists. The runtime D1 binding has
// full access, so the worker can bootstrap its own table even where the
// deploy/CLI token lacks D1-management scope to run `cf:migrate`. The table
// also lives in schema.sql for fresh installs; this is just a self-heal for
// already-provisioned databases. Guarded per-isolate so it runs at most once
// per cold start.
let tableReady = false
async function ensureTable(env: HuoziCloudflareBindings): Promise<void> {
  if (tableReady) return
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS favorites (
       workspace_id TEXT NOT NULL,
       principal_id TEXT NOT NULL,
       file_path    TEXT NOT NULL,
       created_at   INTEGER NOT NULL,
       PRIMARY KEY (workspace_id, principal_id, file_path)
     )`,
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_favorites_ws_principal
       ON favorites (workspace_id, principal_id, created_at)`,
  ).run()
  tableReady = true
}

export async function handleFavorites(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  const { workspaceId, principalId } = auth.principal
  await ensureTable(env)

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT file_path, created_at
         FROM favorites
        WHERE workspace_id = ? AND principal_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(workspaceId, principalId, LIST_LIMIT)
      .all<FavoriteRow>()
    return Response.json({
      ok: true,
      favorites: (results ?? []).map((r) => ({
        file_path: r.file_path,
        created_at: r.created_at,
      })),
    })
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as
      | { file_path?: unknown; favorited?: unknown }
      | null
    const filePath =
      body && typeof body.file_path === 'string' ? body.file_path.trim() : ''
    if (!filePath || filePath.length > MAX_PATH_LEN) {
      return Response.json({ error: 'invalid_file_path' }, { status: 400 })
    }
    // Default to add; only an explicit `favorited: false` removes.
    const favorited = !(body && body.favorited === false)
    if (favorited) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO favorites
           (workspace_id, principal_id, file_path, created_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(workspaceId, principalId, filePath, Date.now())
        .run()
    } else {
      await env.DB.prepare(
        `DELETE FROM favorites
          WHERE workspace_id = ? AND principal_id = ? AND file_path = ?`,
      )
        .bind(workspaceId, principalId, filePath)
        .run()
    }
    return Response.json({ ok: true, file_path: filePath, favorited })
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url)
    const filePath = (url.searchParams.get('file_path') ?? '').trim()
    if (!filePath || filePath.length > MAX_PATH_LEN) {
      return Response.json({ error: 'invalid_file_path' }, { status: 400 })
    }
    await env.DB.prepare(
      `DELETE FROM favorites
        WHERE workspace_id = ? AND principal_id = ? AND file_path = ?`,
    )
      .bind(workspaceId, principalId, filePath)
      .run()
    return Response.json({ ok: true, file_path: filePath, favorited: false })
  }

  return new Response('method not allowed', { status: 405 })
}
