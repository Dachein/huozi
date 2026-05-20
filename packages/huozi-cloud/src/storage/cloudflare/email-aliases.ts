/**
 * Per-user email aliases — sibling to email_tokens, but the local part
 * is user-chosen (e.g. `dachein@mail.huozi.app`) instead of a random
 * unguessable token.
 *
 * Trade-off vs tokens:
 *   - Aliases are memorable, but enumerable. Spam mitigated by the
 *     same `allowed_senders` allowlist tokens use.
 *   - Aliases can be paused (active = 0) without losing the prefix.
 *     Tokens can only be rotated/revoked.
 *
 * Both paths converge in mail-inbound.ts → handleInboundEmail.
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'

const LOCAL_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

// Reserved prefixes: anything that's part of the magic-address format
// (so we don't collide with `t-<32hex>@…`) plus the well-known mailbox
// names every mail system expects to behave a specific way.
const RESERVED = new Set([
  'admin',
  'administrator',
  'postmaster',
  'hostmaster',
  'webmaster',
  'mailer-daemon',
  'noreply',
  'no-reply',
  'root',
  'abuse',
  'security',
  'support',
])

function normalize(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim().toLowerCase()
  if (t.startsWith('t-')) return null // collides with token namespace
  if (RESERVED.has(t)) return null
  if (!LOCAL_RE.test(t)) return null
  return t
}

export interface AliasRow {
  local_part: string
  workspace_id: string
  user_id: string
  active: number
  created_at: number
  last_used_at: number | null
  allowed_senders: string | null
}

export interface AliasPublic {
  local_part: string
  active: boolean
  created_at: number
  last_used_at: number | null
  allowed_senders: string[] | null
}

function rowToPublic(row: AliasRow): AliasPublic {
  let senders: string[] | null = null
  if (row.allowed_senders) {
    try {
      const parsed = JSON.parse(row.allowed_senders) as unknown
      if (Array.isArray(parsed)) {
        senders = parsed.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      senders = null
    }
  }
  return {
    local_part: row.local_part,
    active: row.active === 1,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    allowed_senders: senders,
  }
}

// ── DB helpers (also used by mail-inbound.ts) ────────────────────────

export async function lookupActiveAlias(
  db: D1Database,
  localPart: string,
): Promise<{
  workspace_id: string
  user_id: string
  allowed_senders: string | null
} | null> {
  const row = await db
    .prepare(
      'SELECT workspace_id, user_id, allowed_senders FROM email_aliases WHERE local_part = ? AND active = 1',
    )
    .bind(localPart)
    .first<{ workspace_id: string; user_id: string; allowed_senders: string | null }>()
  return row ?? null
}

export async function touchAliasUse(
  db: D1Database,
  localPart: string,
): Promise<void> {
  await db
    .prepare('UPDATE email_aliases SET last_used_at = ? WHERE local_part = ?')
    .bind(Date.now(), localPart)
    .run()
}

// ── Admin endpoints (called by Next.js side) ─────────────────────────

/**
 * POST /admin/email-aliases/claim
 * body: { workspace_id, user_id, local_part }
 * 201 → { ok: true, alias }
 * 409 → { ok: false, error: "taken" }
 * 400 → { ok: false, error: "invalid_local_part" }
 */
export async function handleAliasClaim(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | { workspace_id?: unknown; user_id?: unknown; local_part?: unknown }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const user_id = typeof body.user_id === 'string' ? body.user_id : ''
  if (!workspace_id || !user_id) {
    return Response.json({ ok: false, error: 'missing_workspace_or_user' }, { status: 400 })
  }
  const local = normalize(body.local_part)
  if (!local) {
    return Response.json(
      {
        ok: false,
        error: 'invalid_local_part',
        message:
          'Use 2-30 lowercase letters/digits, hyphens allowed in the middle. Reserved prefixes (postmaster, t-…, etc.) are blocked.',
      },
      { status: 400 },
    )
  }
  const now = Date.now()
  try {
    await env.DB.prepare(
      'INSERT INTO email_aliases (local_part, workspace_id, user_id, active, created_at) VALUES (?, ?, ?, 1, ?)',
    )
      .bind(local, workspace_id, user_id, now)
      .run()
  } catch (err) {
    // SQLite UNIQUE constraint failure on PK → already claimed.
    const msg = err instanceof Error ? err.message : String(err)
    if (/UNIQUE|already/i.test(msg)) {
      return Response.json({ ok: false, error: 'taken' }, { status: 409 })
    }
    throw err
  }
  const alias: AliasPublic = {
    local_part: local,
    active: true,
    created_at: now,
    last_used_at: null,
    allowed_senders: null,
  }
  return Response.json({ ok: true, alias }, { status: 201 })
}

/**
 * POST /admin/email-aliases/check
 * body: { local_part }
 * 200 → { ok: true, taken: boolean, reason?: "invalid" | "reserved" | "taken" }
 *
 * Authenticated callers only — exposes enough to enumerate one prefix at a
 * time. We don't reveal who owns a taken prefix.
 */
export async function handleAliasCheck(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | { local_part?: unknown }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const raw = typeof body.local_part === 'string' ? body.local_part.trim().toLowerCase() : ''
  if (!raw) return Response.json({ ok: true, taken: false, reason: 'invalid' })
  if (raw.startsWith('t-')) return Response.json({ ok: true, taken: true, reason: 'reserved' })
  if (RESERVED.has(raw)) return Response.json({ ok: true, taken: true, reason: 'reserved' })
  if (!LOCAL_RE.test(raw)) return Response.json({ ok: true, taken: false, reason: 'invalid' })
  const row = await env.DB.prepare('SELECT 1 FROM email_aliases WHERE local_part = ?')
    .bind(raw)
    .first()
  return Response.json({ ok: true, taken: !!row })
}

/**
 * POST /admin/email-aliases/list
 * body: { workspace_id, user_id }
 * 200 → { ok: true, aliases: AliasPublic[] }
 */
export async function handleAliasList(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | { workspace_id?: unknown; user_id?: unknown }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const user_id = typeof body.user_id === 'string' ? body.user_id : ''
  if (!workspace_id || !user_id) {
    return Response.json({ ok: false, error: 'missing_workspace_or_user' }, { status: 400 })
  }
  const rs = await env.DB.prepare(
    'SELECT local_part, workspace_id, user_id, active, created_at, last_used_at, allowed_senders FROM email_aliases WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC',
  )
    .bind(workspace_id, user_id)
    .all<AliasRow>()
  const aliases = (rs.results ?? []).map(rowToPublic)
  return Response.json({ ok: true, aliases })
}

/**
 * POST /admin/email-aliases/set-active
 * body: { workspace_id, user_id, local_part, active: boolean }
 * Ensures the alias belongs to (workspace_id, user_id) before mutating.
 */
export async function handleAliasSetActive(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | {
        workspace_id?: unknown
        user_id?: unknown
        local_part?: unknown
        active?: unknown
      }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const user_id = typeof body.user_id === 'string' ? body.user_id : ''
  const local_part = typeof body.local_part === 'string' ? body.local_part.toLowerCase() : ''
  const active = body.active === true ? 1 : 0
  if (!workspace_id || !user_id || !local_part) {
    return Response.json({ ok: false, error: 'missing_field' }, { status: 400 })
  }
  const r = await env.DB.prepare(
    'UPDATE email_aliases SET active = ? WHERE local_part = ? AND workspace_id = ? AND user_id = ?',
  )
    .bind(active, local_part, workspace_id, user_id)
    .run()
  const changes = r.meta?.changes ?? 0
  if (changes === 0) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
  return Response.json({ ok: true, active: active === 1 })
}

/**
 * POST /admin/email-aliases/release
 * body: { workspace_id, user_id, local_part }
 * Permanently deletes. The prefix becomes free for someone else to claim.
 */
export async function handleAliasRelease(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | { workspace_id?: unknown; user_id?: unknown; local_part?: unknown }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const user_id = typeof body.user_id === 'string' ? body.user_id : ''
  const local_part = typeof body.local_part === 'string' ? body.local_part.toLowerCase() : ''
  if (!workspace_id || !user_id || !local_part) {
    return Response.json({ ok: false, error: 'missing_field' }, { status: 400 })
  }
  const r = await env.DB.prepare(
    'DELETE FROM email_aliases WHERE local_part = ? AND workspace_id = ? AND user_id = ?',
  )
    .bind(local_part, workspace_id, user_id)
    .run()
  const changes = r.meta?.changes ?? 0
  if (changes === 0) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
  return Response.json({ ok: true })
}

/**
 * POST /admin/email-aliases/update-senders
 * body: { workspace_id, user_id, local_part, allowed_senders: string[] | null }
 */
export async function handleAliasUpdateSenders(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  assertAdminAuth(request, env)
  const body = (await request.json().catch(() => null)) as
    | {
        workspace_id?: unknown
        user_id?: unknown
        local_part?: unknown
        allowed_senders?: unknown
      }
    | null
  if (!body) return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : ''
  const user_id = typeof body.user_id === 'string' ? body.user_id : ''
  const local_part = typeof body.local_part === 'string' ? body.local_part.toLowerCase() : ''
  let senders: string[] | null = null
  if (Array.isArray(body.allowed_senders)) {
    senders = body.allowed_senders.filter((x): x is string => typeof x === 'string').map((s) =>
      s.toLowerCase().trim(),
    )
    if (senders.length === 0) senders = null
  } else if (body.allowed_senders !== null && body.allowed_senders !== undefined) {
    return Response.json({ ok: false, error: 'invalid_allowed_senders' }, { status: 400 })
  }
  if (!workspace_id || !user_id || !local_part) {
    return Response.json({ ok: false, error: 'missing_field' }, { status: 400 })
  }
  const sendersJson = senders ? JSON.stringify(senders) : null
  const r = await env.DB.prepare(
    'UPDATE email_aliases SET allowed_senders = ? WHERE local_part = ? AND workspace_id = ? AND user_id = ?',
  )
    .bind(sendersJson, local_part, workspace_id, user_id)
    .run()
  const changes = r.meta?.changes ?? 0
  if (changes === 0) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
  return Response.json({ ok: true, allowed_senders: senders })
}
