/**
 * Email-token D1 access + admin endpoints (Tasks magic-address ingest).
 *
 * Two callers:
 *   1. The standalone `huozi-email-ingest` Worker, bound to the same D1
 *      database, calls `lookupActiveToken(db, token)` directly during
 *      inbound mail handling. No HTTP round-trip — same isolate runtime.
 *   2. The Next.js identity layer (cookie-authed Tasks settings UI) calls
 *      `/admin/email-tokens/*` admin endpoints with the shared
 *      X-Admin-Secret to mint, rotate, revoke, or update a user's token.
 *
 * Token shape: 32-char lowercase hex (128 bits). Encoded as the local-part
 * of the magic address with a `t-` prefix → `t-<token>@mail.huozi.app`.
 *
 * Knowing the address IS the credential. Unknown addresses must be dropped
 * silently (never bounced) so the bounce stream can't be used as an oracle
 * for token enumeration. See `app/docs/tasks.md` §6.1.
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'

export const MAIL_DOMAIN = 'huozi.chat'
export const MAGIC_ADDRESS_LOCAL_PREFIX = 't-'

const TOKEN_HEX_BYTES = 16 // 16 bytes → 32 hex chars → 128 bits

function randomToken(): string {
  const buf = new Uint8Array(TOKEN_HEX_BYTES)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

export function formatMagicAddress(token: string): string {
  return `${MAGIC_ADDRESS_LOCAL_PREFIX}${token}@${MAIL_DOMAIN}`
}

/**
 * Parse `t-<token>@mail.huozi.app` (or a foreign domain on the same Worker)
 * back into a token. Returns null if the local-part lacks the prefix or
 * the address is malformed. Domain is not checked — the email Worker is
 * already domain-scoped by Cloudflare's catch-all rule.
 */
export function parseMagicAddress(address: string): string | null {
  const trimmed = address.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return null
  const local = trimmed.slice(0, at)
  if (!local.startsWith(MAGIC_ADDRESS_LOCAL_PREFIX)) return null
  const token = local.slice(MAGIC_ADDRESS_LOCAL_PREFIX.length)
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  return token
}

// ── D1 access ──────────────────────────────────────────────────────────

export interface EmailTokenRow {
  token: string
  workspace_id: string
  user_id: string
  created_at: number
  revoked_at: number | null
  last_used_at: number | null
  allowed_senders: string | null
}

export interface ActiveTokenLookup {
  workspace_id: string
  user_id: string
  /** Parsed JSON array of allowed sender domains, or null = any. */
  allowed_senders: string[] | null
}

/**
 * Look up an active (non-revoked) token. Returns null if missing or
 * revoked — the email Worker should drop the message silently in that
 * case, never bounce.
 */
export async function lookupActiveToken(
  db: D1Database,
  token: string,
): Promise<ActiveTokenLookup | null> {
  const row = await db
    .prepare(
      `SELECT workspace_id, user_id, allowed_senders
       FROM email_tokens
       WHERE token = ? AND revoked_at IS NULL`,
    )
    .bind(token)
    .first<{
      workspace_id: string
      user_id: string
      allowed_senders: string | null
    }>()
  if (!row) return null
  let parsed: string[] | null = null
  if (row.allowed_senders) {
    try {
      const v = JSON.parse(row.allowed_senders)
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) parsed = v
    } catch {
      // Malformed allowlist column — treat as "no restriction" rather than
      // failing closed. Logging this would be the right reaction but the
      // email Worker doesn't have a logger; the admin endpoints validate
      // input, so a malformed value here means someone hand-edited D1.
    }
  }
  return {
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    allowed_senders: parsed,
  }
}

/** Touch last_used_at after a successful delivery. Fire-and-forget. */
export async function touchTokenUse(db: D1Database, token: string): Promise<void> {
  await db
    .prepare(`UPDATE email_tokens SET last_used_at = ? WHERE token = ?`)
    .bind(Date.now(), token)
    .run()
}

async function findActiveTokenForUser(
  db: D1Database,
  workspaceId: string,
  userId: string,
): Promise<EmailTokenRow | null> {
  return db
    .prepare(
      `SELECT token, workspace_id, user_id, created_at, revoked_at, last_used_at, allowed_senders
       FROM email_tokens
       WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(workspaceId, userId)
    .first<EmailTokenRow>()
}

async function insertToken(
  db: D1Database,
  workspaceId: string,
  userId: string,
  allowedSenders: string[] | null,
): Promise<EmailTokenRow> {
  const token = randomToken()
  const now = Date.now()
  const allowedSendersJson = allowedSenders ? JSON.stringify(allowedSenders) : null
  await db
    .prepare(
      `INSERT INTO email_tokens (token, workspace_id, user_id, created_at, allowed_senders)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(token, workspaceId, userId, now, allowedSendersJson)
    .run()
  return {
    token,
    workspace_id: workspaceId,
    user_id: userId,
    created_at: now,
    revoked_at: null,
    last_used_at: null,
    allowed_senders: allowedSendersJson,
  }
}

// ── Admin handlers ─────────────────────────────────────────────────────

interface PerUserRequest {
  workspace_id: string
  user_id: string
}

function validatePerUser(body: unknown): PerUserRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.workspace_id !== 'string' || !b.workspace_id) return null
  if (typeof b.user_id !== 'string' || !b.user_id) return null
  return { workspace_id: b.workspace_id, user_id: b.user_id }
}

function rowToPublic(row: EmailTokenRow) {
  return {
    token: row.token,
    address: formatMagicAddress(row.token),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    allowed_senders: row.allowed_senders ? (JSON.parse(row.allowed_senders) as string[]) : null,
  }
}

/**
 * Get the user's active token, minting one if they don't have one yet.
 * Idempotent — the typical first-page-load call from the Tasks settings UI.
 */
export async function handleEmailTokenGetOrMint(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const req = validatePerUser(body)
  if (!req) return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })

  const existing = await findActiveTokenForUser(env.DB, req.workspace_id, req.user_id)
  if (existing) return Response.json({ ok: true, ...rowToPublic(existing) })

  const created = await insertToken(env.DB, req.workspace_id, req.user_id, null)
  return Response.json({ ok: true, ...rowToPublic(created) })
}

/**
 * Revoke every active token for this user, then mint a fresh one. The new
 * token inherits the previous token's `allowed_senders` so the user's
 * sender restrictions aren't silently wiped on a rotate.
 */
export async function handleEmailTokenRotate(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const req = validatePerUser(body)
  if (!req) return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })

  const prior = await findActiveTokenForUser(env.DB, req.workspace_id, req.user_id)
  const inheritedSenders = prior?.allowed_senders ? (JSON.parse(prior.allowed_senders) as string[]) : null

  const now = Date.now()
  await env.DB
    .prepare(
      `UPDATE email_tokens SET revoked_at = ?
       WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(now, req.workspace_id, req.user_id)
    .run()

  const created = await insertToken(env.DB, req.workspace_id, req.user_id, inheritedSenders)
  return Response.json({ ok: true, ...rowToPublic(created) })
}

/** Revoke every active token for this user without minting a replacement. */
export async function handleEmailTokenRevoke(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const req = validatePerUser(body)
  if (!req) return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })

  await env.DB
    .prepare(
      `UPDATE email_tokens SET revoked_at = ?
       WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(Date.now(), req.workspace_id, req.user_id)
    .run()
  return Response.json({ ok: true })
}

interface UpdateSendersRequest extends PerUserRequest {
  /** Null = remove allowlist (any sender accepted). Empty array = same. */
  allowed_senders: string[] | null
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * Replace the allowed-senders list for the user's active token. Domains
 * are matched suffix-style against the inbound `From` header by the email
 * Worker — list `acme.com` and a `From: alice@acme.com` will match, while
 * `From: alice@evil.com` will not.
 */
export async function handleEmailTokenUpdateSenders(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  if (typeof b.workspace_id !== 'string' || !b.workspace_id) {
    return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })
  }
  if (typeof b.user_id !== 'string' || !b.user_id) {
    return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })
  }

  let allowed: string[] | null = null
  if (b.allowed_senders !== null && b.allowed_senders !== undefined) {
    if (!Array.isArray(b.allowed_senders)) {
      return Response.json({ error: 'invalid_allowed_senders' }, { status: 400 })
    }
    const normalized: string[] = []
    for (const raw of b.allowed_senders) {
      if (typeof raw !== 'string') {
        return Response.json({ error: 'invalid_allowed_senders' }, { status: 400 })
      }
      const d = raw.trim().toLowerCase()
      if (d.length === 0) continue
      if (!DOMAIN_RE.test(d)) {
        return Response.json({ error: 'invalid_domain', domain: d }, { status: 400 })
      }
      normalized.push(d)
    }
    allowed = normalized.length > 0 ? normalized : null
  }

  const active = await findActiveTokenForUser(env.DB, b.workspace_id, b.user_id)
  if (!active) {
    return Response.json({ error: 'no_active_token' }, { status: 404 })
  }
  await env.DB
    .prepare(`UPDATE email_tokens SET allowed_senders = ? WHERE token = ?`)
    .bind(allowed ? JSON.stringify(allowed) : null, active.token)
    .run()

  return Response.json({ ok: true, allowed_senders: allowed })
}
