/**
 * POST /me/workspaces/bootstrap
 *
 * One-shot endpoint for the agent-install flow at huozi.app/start. Given a
 * valid session JWT (cookie or Authorization: Bearer), it:
 *
 *   1. Reuses the user's first existing workspace, OR creates a new one
 *      derived from the email local-part if they have none.
 *   2. Mints a fresh user-typed api_key in that workspace.
 *   3. Returns { api_key, workspace_slug, key_id, expires_at }.
 *
 * Why this exists: the original /api/agent/{start,step} state machine was
 * deleted with the Supabase migration (see
 * supabase/migrations/00009_drop_agent_sessions.sql). Agents reading the
 * /start install prompt need a single user-authed call that turns "I just
 * proved my email" into "I have an api_key" — without invoking
 * HUOZI_ADMIN_SECRET. This endpoint is that call.
 */

import { sha256Hex } from './sha.js'
import { verifySession, SESSION_COOKIE_NAME } from './jwt.js'
import { DEFAULT_TTL_SECONDS } from './admin.js'
import type { HuoziCloudflareBindings } from './bindings.js'

export interface MeEnv extends HuoziCloudflareBindings {
  HUOZI_AUTH_SECRET?: string
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

interface BootstrapBody {
  /** Label shown in the Connected Agents panel. Default "Agent install". */
  name?: string
  /** Inactivity TTL in seconds. null = never expires. Default 7 days. */
  ttl_seconds?: number | null
}

interface BootstrapResponse {
  ok: true
  api_key: string
  key_id: string
  workspace_id: string
  workspace_slug: string
  workspace_name: string
  /** Whether the workspace was created by this call (vs reused). */
  workspace_created: boolean
  created_at: number
  expires_at: number | null
  ttl_seconds: number | null
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

function readSessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization')
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) return m[1]!.trim()
  }
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const re = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`)
    const m = cookieHeader.match(re)
    if (m) return m[1]!.trim()
  }
  return null
}

/** Derive a candidate slug from the email local-part. Falls back to "user". */
function slugifyEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user'
  const base = local.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (base.length >= 3 && base.length <= 64 && SLUG_RE.test(base)) return base
  if (base.length < 3) return `${base}-${randomHex(2)}`
  return base.slice(0, 60).replace(/-+$/g, '') || 'user'
}

async function findFreeSlug(db: D1Database, base: string): Promise<string | null> {
  // Try `<base>`, then `<base>-2` … `<base>-99`. Bounded so a malicious or
  // unlucky retry doesn't burn unbounded D1 reads.
  for (let i = 1; i <= 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`
    if (!SLUG_RE.test(candidate)) continue
    const taken = await db
      .prepare(`SELECT id FROM workspaces WHERE slug = ? LIMIT 1`)
      .bind(candidate)
      .first<{ id: string }>()
    if (!taken) return candidate
  }
  return null
}

export async function handleMeBootstrap(
  request: Request,
  env: MeEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const secret = env.HUOZI_AUTH_SECRET
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: 'auth_not_configured' },
      { status: 501 },
    )
  }

  const token = readSessionToken(request)
  if (!token) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const claims = await verifySession(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }

  let body: BootstrapBody = {}
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      body = (await request.json()) as BootstrapBody
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }
  }

  const userId = claims.sub
  const email = claims.email
  const now = Date.now()

  // Step 1 — existing workspace or new one. Prefer the user's earliest
  // owned workspace so repeated bootstraps land in the same place.
  let ws = await env.DB
    .prepare(
      `SELECT id, slug, name FROM workspaces
       WHERE owner_id = ?
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string; slug: string; name: string }>()
  let created = false

  if (!ws) {
    const base = slugifyEmail(email)
    const slug = await findFreeSlug(env.DB, base)
    if (!slug) {
      return Response.json(
        { error: 'slug_unavailable', base },
        { status: 409 },
      )
    }
    const wsId = crypto.randomUUID()
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO workspaces (id, slug, name, owner_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(wsId, slug, slug, userId, now),
        env.DB.prepare(
          `INSERT INTO workspace_members
           (workspace_id, user_id, role, joined_at, invited_by)
           VALUES (?, ?, 'owner', ?, NULL)`,
        ).bind(wsId, userId, now),
      ])
    } catch (err) {
      return Response.json(
        {
          error: 'workspace_insert_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      )
    }
    ws = { id: wsId, slug, name: slug }
    created = true
  }

  // Step 2 — mint api_key. principal_type='user' so the key inherits the
  // user's full workspace_members.role caps; no scope_path → root scope.
  // Data tables key on `ws_<slug>`, not the UUID — see api-keys-validate.ts.
  const wsDataId = `ws_${ws.slug}`
  const apiKey = `hz_${ws.slug}_${randomHex(16)}`
  const keyId = `k_${randomHex(8)}`
  const keyHash = await sha256Hex(apiKey)
  const ttlSeconds =
    body.ttl_seconds === undefined ? DEFAULT_TTL_SECONDS : body.ttl_seconds
  if (ttlSeconds !== null && (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)) {
    return Response.json({ error: 'invalid_ttl_seconds' }, { status: 400 })
  }
  const expiresAt = ttlSeconds === null ? null : now + ttlSeconds * 1000
  const keyName = body.name ?? 'Agent install'

  try {
    await env.DB
      .prepare(
        `INSERT INTO api_keys
         (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id,
          created_at, expires_at, ttl_seconds, name)
         VALUES (?, ?, ?, NULL, 'user', ?, ?, ?, ?, ?)`,
      )
      .bind(keyId, keyHash, wsDataId, userId, now, expiresAt, ttlSeconds, keyName)
      .run()
  } catch (err) {
    return Response.json(
      {
        error: 'key_insert_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  const res: BootstrapResponse = {
    ok: true,
    api_key: apiKey,
    key_id: keyId,
    workspace_id: ws.id,
    workspace_slug: ws.slug,
    workspace_name: ws.name,
    workspace_created: created,
    created_at: now,
    expires_at: expiresAt,
    ttl_seconds: ttlSeconds,
  }
  return Response.json(res)
}
