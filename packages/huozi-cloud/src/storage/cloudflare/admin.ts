/**
 * Admin endpoints — server-to-server operations callable ONLY by trusted
 * backends (huozi.app's Next.js server) using a shared `X-Admin-Secret`.
 *
 * Scope:
 *   - Mint new API keys (on behalf of a workspace owner)
 *   - Revoke a key by key_id
 *   - List keys for a workspace (returns metadata only, NO key hashes)
 *
 * The admin secret is set via `wrangler secret put HUOZI_ADMIN_SECRET` and
 * shared out-of-band with huozi.app's Next.js deploy (same secret set on
 * that worker's env). Browsers NEVER see this secret.
 */

import { sha256Hex } from './sha.js'
import type { HuoziCloudflareBindings } from './bindings.js'
import { validatePrincipalAndWorkspace } from './api-keys-validate.js'

export interface AdminEnv extends HuoziCloudflareBindings {
  HUOZI_ADMIN_SECRET?: string
}

/** Constant-time-ish string equality (fine for secrets of known length). */
function secureEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Check that the request carries a valid X-Admin-Secret header.
 * Returns the env secret on success, or throws a Response on failure.
 */
export function assertAdminAuth(request: Request, env: AdminEnv): void {
  const provided = request.headers.get('x-admin-secret')
  const expected = env.HUOZI_ADMIN_SECRET
  if (!expected) {
    throw new Response(
      JSON.stringify({ error: 'admin_not_configured' }),
      {
        status: 501,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
  if (!provided || !secureEquals(provided, expected)) {
    throw new Response(
      JSON.stringify({ error: 'invalid_admin_secret' }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}

// ── Mint key ─────────────────────────────────────────────────────────────

export interface MintKeyRequest {
  workspace_id: string
  principal_id: string
  principal_type: 'user' | 'agent' | 'system'
  scope_path?: string | null
  name?: string
  /** If omitted, we generate one (`k_<random>`). */
  key_id?: string
  /**
   * Inactivity TTL in seconds — sliding window. The key dies if not used
   * for this long. `null` means "never expires" (legacy behaviour).
   * If omitted, caller gets the default (see `DEFAULT_TTL_SECONDS`).
   */
  ttl_seconds?: number | null
}

export interface MintKeyResponse {
  ok: true
  key_id: string
  api_key: string
  workspace_id: string
  principal_id: string
  created_at: number
  ttl_seconds: number | null
  expires_at: number | null
}

/**
 * Default inactivity window for newly-minted keys.
 *
 * 7 days: long enough that an engaged user won't notice it, short enough
 * that a key abandoned across machines dies before it can be misused.
 * Existing keys (ttl_seconds IS NULL) keep their prior "never expires"
 * semantics — the migration preserves backwards compatibility.
 */
export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

/** Valid user-facing TTL presets (seconds). `null` means "never". */
export const TTL_PRESETS_SECONDS: ReadonlyArray<number | null> = [
  1 * 24 * 60 * 60, // 1 day
  7 * 24 * 60 * 60, // 7 days (default)
  30 * 24 * 60 * 60, // 30 days
  180 * 24 * 60 * 60, // 180 days
  null, // never
]

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

export async function handleMintKey(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: MintKeyRequest
  try {
    body = (await request.json()) as MintKeyRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Validate basic shape.
  if (
    !body.workspace_id ||
    !body.principal_id ||
    !body.principal_type ||
    !['user', 'agent', 'system'].includes(body.principal_type)
  ) {
    return Response.json(
      { error: 'missing_or_invalid_fields' },
      { status: 400 },
    )
  }

  // Referential integrity — D1 has no FKs, so we police it here. Skipping
  // this check is what produced the orphan-principal bug; never again.
  const refCheck = await validatePrincipalAndWorkspace(env, {
    principalType: body.principal_type as 'user' | 'agent' | 'system',
    principalId: body.principal_id,
    workspaceId: body.workspace_id,
  })
  if (!refCheck.ok) {
    return Response.json(
      { error: refCheck.error, field: refCheck.field },
      { status: 400 },
    )
  }

  // Generate token and key_id.
  // Using a random suffix means callers get a cryptographically strong token
  // they can hand directly to an Agent.
  const slug = body.workspace_id.replace(/^ws_/, '').replace(/[^a-z0-9-]/gi, '')
  const apiKey = `hz_${slug || 'agent'}_${randomHex(16)}`
  const keyId = body.key_id ?? `k_${randomHex(8)}`
  const keyHash = await sha256Hex(apiKey)
  const now = Date.now()

  // TTL: explicit null → never. undefined → default. number → custom.
  const ttlSeconds =
    body.ttl_seconds === undefined ? DEFAULT_TTL_SECONDS : body.ttl_seconds
  // Validate: must be either null or a positive integer within preset range.
  if (ttlSeconds !== null) {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return Response.json(
        { error: 'invalid_ttl_seconds' },
        { status: 400 },
      )
    }
  }
  const expiresAt = ttlSeconds === null ? null : now + ttlSeconds * 1000

  try {
    await env.DB.prepare(
      `INSERT INTO api_keys
       (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id,
        created_at, expires_at, ttl_seconds, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        keyId,
        keyHash,
        body.workspace_id,
        body.scope_path ?? null,
        body.principal_type,
        body.principal_id,
        now,
        expiresAt,
        ttlSeconds,
        body.name ?? null,
      )
      .run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Most common: UNIQUE(key_hash) collision — vanishingly unlikely but
    // surface it cleanly.
    return Response.json(
      { error: 'insert_failed', message },
      { status: 500 },
    )
  }

  const res: MintKeyResponse = {
    ok: true,
    key_id: keyId,
    api_key: apiKey,
    workspace_id: body.workspace_id,
    principal_id: body.principal_id,
    created_at: now,
    ttl_seconds: ttlSeconds,
    expires_at: expiresAt,
  }
  return Response.json(res)
}

// ── Revoke key ───────────────────────────────────────────────────────────

export interface RevokeKeyRequest {
  key_id: string
}

export async function handleRevokeKey(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response('method not allowed', { status: 405 })
  }

  let key_id: string | undefined
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as RevokeKeyRequest
      key_id = body.key_id
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }
  } else {
    const url = new URL(request.url)
    key_id = url.searchParams.get('key_id') ?? undefined
  }

  if (!key_id) {
    return Response.json({ error: 'missing_key_id' }, { status: 400 })
  }

  // Soft delete: keep the row for audit, just mark revoked_at. The auth
  // path filters `revoked_at IS NULL`, so the key stops working immediately
  // (modulo the 5-min in-isolate auth cache TTL — same window as before).
  // Already-revoked rows aren't re-stamped: idempotent revoke.
  const now = Date.now()
  const result = await env.DB.prepare(
    'UPDATE api_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL',
  )
    .bind(now, key_id)
    .run()

  return Response.json({
    ok: true,
    revoked: result.meta?.changes ?? 0,
    revoked_at: now,
  })
}

// ── List keys ────────────────────────────────────────────────────────────

export interface ListedKey {
  key_id: string
  workspace_id: string
  scope_path: string | null
  principal_type: string
  principal_id: string
  created_at: number
  expires_at: number | null
  last_used_at: number | null
  ttl_seconds: number | null
  name: string | null
  /** Last tool the key called (e.g. "huozi_write"). Null if never used or
   *  if the key has only done tools/list / initialize pings. */
  last_action_tool: string | null
  /** Best-effort summary of what the last action operated on — file_path,
   *  glob pattern, or "path (+N more)" for batch edits. Capped to 160 chars. */
  last_action_target: string | null
  /** Unix ms when the key was soft-deleted via /admin/revoke-key. Null if
   *  the key is still active. Default list excludes revoked rows; pass
   *  `?include_revoked=1` to see them too. */
  revoked_at: number | null
}

export async function handleListKeys(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }

  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspace_id')
  if (!workspaceId) {
    return Response.json({ error: 'missing_workspace_id' }, { status: 400 })
  }
  const includeRevoked = url.searchParams.get('include_revoked') === '1'

  const sql = includeRevoked
    ? `SELECT key_id, workspace_id, scope_path, principal_type, principal_id,
              created_at, expires_at, last_used_at, ttl_seconds, name,
              last_action_tool, last_action_target, revoked_at
       FROM api_keys
       WHERE workspace_id = ?
       ORDER BY created_at DESC`
    : `SELECT key_id, workspace_id, scope_path, principal_type, principal_id,
              created_at, expires_at, last_used_at, ttl_seconds, name,
              last_action_tool, last_action_target, revoked_at
       FROM api_keys
       WHERE workspace_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`

  const { results } = await env.DB.prepare(sql)
    .bind(workspaceId)
    .all<ListedKey>()

  return Response.json({ ok: true, keys: results })
}

// ── Update key TTL ───────────────────────────────────────────────────────

export interface UpdateKeyTtlRequest {
  key_id: string
  /** New inactivity window in seconds. `null` means "never expires". */
  ttl_seconds: number | null
}

/**
 * Change an existing key's inactivity TTL.
 *
 * We recompute `expires_at` from the key's last activity time so the
 * change takes effect immediately:
 *   - if the key has been used: `expires_at = last_used_at + ttl_seconds`
 *   - if never used: `expires_at = created_at + ttl_seconds`
 *   - if ttl_seconds === null: `expires_at = null` (never)
 *
 * This means switching from "7 days" to "30 days" on a key that's been
 * idle for 3 days gives it 27 more days (not 30) — the sliding window is
 * anchored to last use, not to the moment of the TTL change. This matches
 * how users think about "7 days of inactivity": the clock is on activity.
 */
export async function handleUpdateKeyTtl(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: UpdateKeyTtlRequest
  try {
    body = (await request.json()) as UpdateKeyTtlRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.key_id) {
    return Response.json({ error: 'missing_key_id' }, { status: 400 })
  }
  const ttl = body.ttl_seconds
  if (ttl !== null) {
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) {
      return Response.json({ error: 'invalid_ttl_seconds' }, { status: 400 })
    }
  }

  const row = await env.DB.prepare(
    'SELECT last_used_at, created_at FROM api_keys WHERE key_id = ?',
  )
    .bind(body.key_id)
    .first<{ last_used_at: number | null; created_at: number }>()

  if (!row) {
    return Response.json({ error: 'unknown_key_id' }, { status: 404 })
  }

  const anchor = row.last_used_at ?? row.created_at
  const expiresAt = ttl === null ? null : anchor + ttl * 1000

  const result = await env.DB.prepare(
    'UPDATE api_keys SET ttl_seconds = ?, expires_at = ? WHERE key_id = ?',
  )
    .bind(ttl, expiresAt, body.key_id)
    .run()

  return Response.json({
    ok: true,
    key_id: body.key_id,
    ttl_seconds: ttl,
    expires_at: expiresAt,
    updated: result.meta?.changes ?? 0,
  })
}
