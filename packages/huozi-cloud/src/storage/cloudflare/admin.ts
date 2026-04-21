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
}

export interface MintKeyResponse {
  ok: true
  key_id: string
  api_key: string
  workspace_id: string
  principal_id: string
  created_at: number
}

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

  // Generate token and key_id.
  // Using a random suffix means callers get a cryptographically strong token
  // they can hand directly to an Agent.
  const slug = body.workspace_id.replace(/^ws_/, '').replace(/[^a-z0-9-]/gi, '')
  const apiKey = `hz_${slug || 'agent'}_${randomHex(16)}`
  const keyId = body.key_id ?? `k_${randomHex(8)}`
  const keyHash = await sha256Hex(apiKey)
  const now = Date.now()

  try {
    await env.DB.prepare(
      `INSERT INTO api_keys
       (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id, created_at, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        keyId,
        keyHash,
        body.workspace_id,
        body.scope_path ?? null,
        body.principal_type,
        body.principal_id,
        now,
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

  const result = await env.DB.prepare(
    'DELETE FROM api_keys WHERE key_id = ?',
  )
    .bind(key_id)
    .run()

  return Response.json({
    ok: true,
    deleted: result.meta?.changes ?? 0,
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
  name: string | null
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

  const { results } = await env.DB.prepare(
    `SELECT key_id, workspace_id, scope_path, principal_type, principal_id,
            created_at, expires_at, last_used_at, name
     FROM api_keys
     WHERE workspace_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(workspaceId)
    .all<ListedKey>()

  return Response.json({ ok: true, keys: results })
}
