/**
 * OAuth 2.0 device authorization flow (RFC 8628), adapted to huozi.
 *
 * Three endpoints:
 *
 *   • POST /auth/device-code        (public, Agent → us)
 *     Agent bootstraps. We issue a long opaque `device_code` (Agent
 *     polls with this) and a short `user_code` (human reads aloud or
 *     copy-pastes into the /device page).
 *
 *   • POST /auth/token              (public, Agent polling)
 *     Agent sends { device_code }. We answer:
 *       - status='pending'     → 202 { error: "authorization_pending" }
 *       - status='expired'     → 400 { error: "expired_token" }
 *       - status='denied'      → 400 { error: "access_denied" }
 *       - status='authorized'  → 200 { api_key, workspace, ... } AND
 *                                mark consumed + scrub plaintext key.
 *
 *   • POST /admin/device-authorize  (admin-secret, Next.js → us)
 *     Called from huozi.app after the user clicks "Authorize Claude
 *     Code" on the /device page. Takes { user_code, user_id,
 *     workspace_id, workspace_slug, label, agent_kind }, resolves the
 *     grant by user_code, mints a scoped api_key via the same path as
 *     the normal mint-key admin endpoint, writes plaintext + status
 *     back to the row. Idempotent for the same user_code.
 *
 * Security knobs:
 *   - Grant TTL: 15 min
 *   - Polling interval: 5s (Agent MUST respect; we don't strictly
 *     enforce rate-limiting in v1 but return `slow_down` on abuse
 *     pattern later).
 *   - user_code: 8 chars from a reduced alphabet (no 0/O/1/I/L) to
 *     minimize mistype when read aloud.
 *   - Plaintext api_key lives in D1 only between authorize → first
 *     successful poll. Scrubbed to NULL on consume.
 */

import { sha256Hex } from './sha.js'
import type { HuoziCloudflareBindings } from './bindings.js'
import { assertAdminAuth, type AdminEnv } from './admin.js'

// ── Config ──────────────────────────────────────────────────────────

const GRANT_TTL_SECONDS = 15 * 60
const POLL_INTERVAL_SECONDS = 5
const DEVICE_CODE_BYTES = 24 // 48 hex chars
/** No 0/O/1/I/L to reduce misread when said out loud. */
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const USER_CODE_LEN = 8 // e.g. "ABCD-1234"

// ── Helpers ─────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

function generateUserCode(): string {
  const buf = new Uint8Array(USER_CODE_LEN)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < USER_CODE_LEN; i++) {
    if (i === 4) out += '-'
    out += USER_CODE_ALPHABET[buf[i]! % USER_CODE_ALPHABET.length]
  }
  return out
}

interface GrantRow {
  device_code: string
  user_code: string
  client_name: string | null
  agent_kind: string | null
  status: 'pending' | 'authorized' | 'denied' | 'expired' | 'consumed'
  user_id: string | null
  workspace_id: string | null
  workspace_slug: string | null
  api_key: string | null
  api_key_id: string | null
  created_at: number
  expires_at: number
  authorized_at: number | null
  consumed_at: number | null
}

// ── POST /auth/device-code  (public) ────────────────────────────────

interface DeviceCodeRequest {
  client_name?: string
  agent_kind?: string
}

export async function handleDeviceCode(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: DeviceCodeRequest
  try {
    body = (await request.json().catch(() => ({}))) as DeviceCodeRequest
  } catch {
    body = {}
  }
  const clientName = (body.client_name ?? '').trim().slice(0, 80) || null
  const agentKind = (body.agent_kind ?? '').trim().slice(0, 32) || null

  const device_code = randomHex(DEVICE_CODE_BYTES)
  const user_code = generateUserCode()
  const now = Date.now()
  const expires_at = now + GRANT_TTL_SECONDS * 1000

  await env.DB.prepare(
    `INSERT INTO device_grants
     (device_code, user_code, client_name, agent_kind, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(device_code, user_code, clientName, agentKind, now, expires_at)
    .run()

  // Front-end URL that the user opens. We keep this hard-coded to
  // huozi.app since the Worker doesn't own the front-end origin.
  const verification_url_base = 'https://huozi.app/device'

  return Response.json({
    device_code,
    user_code,
    verification_url: verification_url_base,
    verification_url_complete: `${verification_url_base}?code=${encodeURIComponent(user_code)}`,
    expires_in: GRANT_TTL_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  })
}

// ── POST /auth/token  (public, polled by Agent) ─────────────────────

interface TokenRequest {
  device_code?: string
}

export async function handleDeviceToken(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: TokenRequest
  try {
    body = (await request.json()) as TokenRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const deviceCode = (body.device_code ?? '').trim()
  if (!deviceCode || !/^[a-f0-9]{48}$/.test(deviceCode)) {
    return Response.json({ error: 'invalid_device_code' }, { status: 400 })
  }

  const row = await env.DB.prepare(
    `SELECT * FROM device_grants WHERE device_code = ?`,
  )
    .bind(deviceCode)
    .first<GrantRow>()
  if (!row) {
    return Response.json({ error: 'invalid_device_code' }, { status: 404 })
  }

  const now = Date.now()

  // Lazy expiry: if pending but past deadline, flip state.
  if (row.status === 'pending' && row.expires_at < now) {
    await env.DB.prepare(
      `UPDATE device_grants SET status='expired' WHERE device_code = ?`,
    )
      .bind(deviceCode)
      .run()
    return Response.json({ error: 'expired_token' }, { status: 400 })
  }

  if (row.status === 'pending') {
    return Response.json(
      { error: 'authorization_pending' },
      { status: 202 },
    )
  }
  if (row.status === 'denied') {
    return Response.json({ error: 'access_denied' }, { status: 400 })
  }
  if (row.status === 'expired') {
    return Response.json({ error: 'expired_token' }, { status: 400 })
  }
  if (row.status === 'consumed') {
    // Second poll after success — the key has been scrubbed, this is
    // an old replay. Behave like expired.
    return Response.json({ error: 'expired_token' }, { status: 400 })
  }

  // status === 'authorized' — deliver key and scrub.
  if (!row.api_key) {
    // Shouldn't happen but be defensive.
    return Response.json(
      { error: 'server_error', message: 'missing api_key' },
      { status: 500 },
    )
  }

  const payload = {
    api_key: row.api_key,
    key_id: row.api_key_id,
    workspace: {
      id: row.workspace_id,
      slug: row.workspace_slug,
    },
  }

  // Scrub atomically. If another poll raced us, it'll see status=consumed.
  const scrubRes = await env.DB.prepare(
    `UPDATE device_grants
     SET status='consumed', consumed_at=?, api_key=NULL
     WHERE device_code = ? AND status='authorized'`,
  )
    .bind(now, deviceCode)
    .run()
  const changes = scrubRes.meta?.changes ?? 0
  if (changes === 0) {
    // Raced: another poll already consumed it.
    return Response.json({ error: 'expired_token' }, { status: 400 })
  }

  return Response.json(payload)
}

// ── POST /admin/device-authorize  (admin-secret) ────────────────────

interface AuthorizeRequest {
  user_code?: string
  user_id?: string
  workspace_id?: string
  workspace_slug?: string
  label?: string
}

async function mintScopedKey(
  env: HuoziCloudflareBindings,
  input: {
    workspace_id: string
    user_id: string
    name: string
  },
): Promise<{ key_id: string; api_key: string }> {
  // Mirror of admin.ts's mint logic — kept inline so this module is
  // self-contained and doesn't import across layers.
  const slug = input.workspace_id.replace(/^ws_/, '').replace(/[^a-z0-9-]/gi, '')
  const apiKey = `hz_${slug || 'agent'}_${randomHex(16)}`
  const keyId = `k_${randomHex(8)}`
  const keyHash = await sha256Hex(apiKey)
  const now = Date.now()

  await env.DB.prepare(
    `INSERT INTO api_keys
     (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id, created_at, name)
     VALUES (?, ?, ?, NULL, 'agent', ?, ?, ?)`,
  )
    .bind(keyId, keyHash, input.workspace_id, input.user_id, now, input.name)
    .run()

  return { key_id: keyId, api_key: apiKey }
}

export async function handleDeviceAuthorize(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: AuthorizeRequest
  try {
    body = (await request.json()) as AuthorizeRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const userCode = (body.user_code ?? '').trim().toUpperCase()
  const userId = (body.user_id ?? '').trim()
  const workspaceId = (body.workspace_id ?? '').trim()
  const workspaceSlug = (body.workspace_slug ?? '').trim()
  const label = (body.label ?? '').trim() || 'Device · browser auth'

  if (!userCode || !userId || !workspaceId || !workspaceSlug) {
    return Response.json(
      { error: 'missing_fields' },
      { status: 400 },
    )
  }

  const row = await env.DB.prepare(
    `SELECT * FROM device_grants WHERE user_code = ?`,
  )
    .bind(userCode)
    .first<GrantRow>()

  if (!row) {
    return Response.json({ error: 'unknown_user_code' }, { status: 404 })
  }

  const now = Date.now()
  if (row.expires_at < now) {
    await env.DB.prepare(
      `UPDATE device_grants SET status='expired' WHERE device_code = ?`,
    )
      .bind(row.device_code)
      .run()
    return Response.json({ error: 'expired' }, { status: 410 })
  }

  if (row.status !== 'pending') {
    return Response.json(
      { error: 'grant_not_pending', state: row.status },
      { status: 409 },
    )
  }

  // Mint the scoped key. Name encodes agent_kind for Edge-style parsing
  // consistency (keeps huozi-cloud's api_keys rows uniform).
  const keyName =
    row.agent_kind && label
      ? `[${row.agent_kind}] ${label}`
      : label

  const { key_id, api_key } = await mintScopedKey(env, {
    workspace_id: workspaceId,
    user_id: userId,
    name: keyName,
  })

  const update = await env.DB.prepare(
    `UPDATE device_grants
     SET status='authorized',
         user_id=?, workspace_id=?, workspace_slug=?,
         api_key=?, api_key_id=?, authorized_at=?
     WHERE device_code = ? AND status='pending'`,
  )
    .bind(userId, workspaceId, workspaceSlug, api_key, key_id, now, row.device_code)
    .run()

  const changes = update.meta?.changes ?? 0
  if (changes === 0) {
    // Another authorize raced us (shouldn't happen with admin-only
    // access, but be defensive).
    return Response.json(
      { error: 'grant_not_pending' },
      { status: 409 },
    )
  }

  return Response.json({
    ok: true,
    user_code: userCode,
    workspace_id: workspaceId,
    workspace_slug: workspaceSlug,
    client_name: row.client_name,
    agent_kind: row.agent_kind,
    // Expose the newly-minted key id so the Cloud edition's authorize
    // route can record a matching cloud_connections row. The key itself
    // is held privately until the Agent polls /auth/token.
    key_id,
  })
}

// Denying a pending grant — used by the /device page's "Deny" button.
export async function handleDeviceDeny(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: { user_code?: string }
  try {
    body = (await request.json()) as { user_code?: string }
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const userCode = (body.user_code ?? '').trim().toUpperCase()
  if (!userCode) {
    return Response.json({ error: 'missing_user_code' }, { status: 400 })
  }
  await env.DB.prepare(
    `UPDATE device_grants SET status='denied'
     WHERE user_code = ? AND status='pending'`,
  )
    .bind(userCode)
    .run()
  return Response.json({ ok: true })
}

/** Inspection helper used by the /device page to render context before
 *  Authorize is pressed. Admin-auth for safety. */
export async function handleDeviceInspect(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  const url = new URL(request.url)
  const userCode = (url.searchParams.get('user_code') ?? '').trim().toUpperCase()
  if (!userCode) {
    return Response.json({ error: 'missing_user_code' }, { status: 400 })
  }
  const row = await env.DB.prepare(
    `SELECT user_code, client_name, agent_kind, status, created_at, expires_at
     FROM device_grants WHERE user_code = ?`,
  )
    .bind(userCode)
    .first<
      Pick<GrantRow, 'user_code' | 'client_name' | 'agent_kind' | 'status' | 'created_at' | 'expires_at'>
    >()
  if (!row) {
    return Response.json({ error: 'unknown_user_code' }, { status: 404 })
  }
  return Response.json({ ok: true, grant: row })
}
