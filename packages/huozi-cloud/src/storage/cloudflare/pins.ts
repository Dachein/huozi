/**
 * /me/pins — per-(workspace, principal) file pins.
 *
 * UI-facing convenience for the miniapp / web "pinned files" list. Like
 * `recent.ts`, this is a plain Bearer-authed Worker endpoint, deliberately
 * NOT an MCP tool — pinning is a human-surface action, so keeping it off
 * the agent tool list avoids polluting every agent's schema. Mounted under
 * /me/* so it matches an existing cloud.huozi.app route pattern.
 *
 *   GET    /me/pins                    → list the caller's pins
 *   POST   /me/pins  { file_path, pinned? }
 *                                           → add (pinned !== false) or
 *                                             remove (pinned === false)
 *   DELETE /me/pins?file_path=<path>   → remove
 *
 * Scoped to the issuing principal, so two users sharing a workspace keep
 * independent pins. The api key the miniapp uses for /mcp resolves to the
 * same principal here, so GET and POST stay consistent across surfaces.
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'

const MAX_PATH_LEN = 1024
const LIST_LIMIT = 2000

interface PinRow {
  file_path: string
  created_at: number
}

// Lazily ensure the `pins` table exists. The runtime D1 binding has
// full access, so the worker can bootstrap its own table even where the
// deploy/CLI token lacks D1-management scope to run `cf:migrate`. The table
// also lives in schema.sql for fresh installs; this is just a self-heal for
// already-provisioned databases. Guarded per-isolate so it runs at most once
// per cold start.
let tableReady = false
async function ensureTable(env: HuoziCloudflareBindings): Promise<void> {
  if (tableReady) return
  // One-time migration: the table was originally named `favorites`. Rename it
  // (preserving rows) when `pins` is absent and `favorites` still exists.
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pins','favorites')`,
  ).all<{ name: string }>()
  const tables = new Set((results ?? []).map((r) => r.name))
  if (!tables.has('pins') && tables.has('favorites')) {
    await env.DB.prepare(`ALTER TABLE favorites RENAME TO pins`).run()
    await env.DB.prepare(`DROP INDEX IF EXISTS idx_favorites_ws_principal`).run()
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS pins (
       workspace_id TEXT NOT NULL,
       principal_id TEXT NOT NULL,
       file_path    TEXT NOT NULL,
       created_at   INTEGER NOT NULL,
       PRIMARY KEY (workspace_id, principal_id, file_path)
     )`,
  ).run()
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_pins_ws_principal
       ON pins (workspace_id, principal_id, created_at)`,
  ).run()
  tableReady = true
}

export async function handlePins(
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
         FROM pins
        WHERE workspace_id = ? AND principal_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(workspaceId, principalId, LIST_LIMIT)
      .all<PinRow>()
    return Response.json({
      ok: true,
      pins: (results ?? []).map((r) => ({
        file_path: r.file_path,
        created_at: r.created_at,
      })),
    })
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as
      | { file_path?: unknown; pinned?: unknown }
      | null
    const filePath =
      body && typeof body.file_path === 'string' ? body.file_path.trim() : ''
    if (!filePath || filePath.length > MAX_PATH_LEN) {
      return Response.json({ error: 'invalid_file_path' }, { status: 400 })
    }
    // Default to add; only an explicit `pinned: false` removes.
    const pinned = !(body && body.pinned === false)
    if (pinned) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO pins
           (workspace_id, principal_id, file_path, created_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(workspaceId, principalId, filePath, Date.now())
        .run()
    } else {
      await env.DB.prepare(
        `DELETE FROM pins
          WHERE workspace_id = ? AND principal_id = ? AND file_path = ?`,
      )
        .bind(workspaceId, principalId, filePath)
        .run()
    }
    return Response.json({ ok: true, file_path: filePath, pinned })
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url)
    const filePath = (url.searchParams.get('file_path') ?? '').trim()
    if (!filePath || filePath.length > MAX_PATH_LEN) {
      return Response.json({ error: 'invalid_file_path' }, { status: 400 })
    }
    await env.DB.prepare(
      `DELETE FROM pins
        WHERE workspace_id = ? AND principal_id = ? AND file_path = ?`,
    )
      .bind(workspaceId, principalId, filePath)
      .run()
    return Response.json({ ok: true, file_path: filePath, pinned: false })
  }

  return new Response('method not allowed', { status: 405 })
}
