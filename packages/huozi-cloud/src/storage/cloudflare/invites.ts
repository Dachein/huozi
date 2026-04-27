/**
 * Workspace invite admin endpoints.
 *
 * Flow:
 *   1. Owner POSTs /admin/invites { workspace_id, email, role,
 *      invited_by_user_id, accept_url_base } → Worker stores token,
 *      emails the invitee a link `<accept_url_base>/<token>`.
 *   2. Invitee opens the link in browser → Next.js /invite/[token] page.
 *   3. If logged in: page calls /admin/invites/redeem {token, user_id}
 *      → Worker INSERTs workspace_members row, marks accepted_at.
 *   4. If not logged in: /invite/[token] redirects to /login with the
 *      email pre-filled, then auto-redeems after OTP.
 *
 * Security:
 *   - Tokens are 32-byte random hex (256 bits). Single use.
 *   - 7-day expiry from issue.
 *   - Email-bound: redeem checks the invite email matches the
 *     authenticated user's email; mismatch = reject.
 *   - Owner-only mint enforced by caller (Next.js identity layer).
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'
import { sendInviteEmail, type MailerEnv } from './mailer.js'

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
const VALID_ROLES = new Set(['member'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface InvitesAdminEnv extends AdminEnv, MailerEnv {}

function randomToken(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++)
    out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

// ── POST /admin/invites ──────────────────────────────────────────────────

export interface MintInviteRequest {
  workspace_id: string
  email: string
  role?: string
  invited_by: string
  /** Base URL for the accept link (e.g. "https://huozi.app/invite"). */
  accept_url_base: string
}

export async function handleMintInvite(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: MintInviteRequest
  try {
    body = (await request.json()) as MintInviteRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const role = (body.role ?? 'member').trim()
  if (!body.workspace_id || !body.invited_by || !body.accept_url_base) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }
  if (!VALID_ROLES.has(role)) {
    return Response.json({ error: 'invalid_role' }, { status: 400 })
  }

  // Look up workspace name for the email body.
  const ws = await env.DB.prepare(
    `SELECT name FROM workspaces WHERE id = ?`,
  )
    .bind(body.workspace_id)
    .first<{ name: string }>()
  if (!ws) {
    return Response.json({ error: 'unknown_workspace' }, { status: 404 })
  }
  const inviter = await env.DB.prepare(
    `SELECT email FROM users WHERE id = ?`,
  )
    .bind(body.invited_by)
    .first<{ email: string }>()
  if (!inviter) {
    return Response.json({ error: 'unknown_inviter' }, { status: 404 })
  }

  // If the invitee is already a member, short-circuit.
  const existing = await env.DB.prepare(
    `SELECT 1 AS x FROM workspace_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ? AND u.email = ?`,
  )
    .bind(body.workspace_id, email)
    .first<{ x: number }>()
  if (existing) {
    return Response.json({ error: 'already_member' }, { status: 409 })
  }

  const token = randomToken()
  const now = Date.now()
  const expiresAt = now + INVITE_TTL_SECONDS * 1000

  await env.DB.prepare(
    `INSERT INTO workspace_invites
     (token, workspace_id, email, role, invited_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(token, body.workspace_id, email, role, body.invited_by, now, expiresAt)
    .run()

  const acceptUrl = `${body.accept_url_base.replace(/\/$/, '')}/${token}`
  try {
    await sendInviteEmail(env, {
      to: email,
      workspaceName: ws.name,
      inviterEmail: inviter.email,
      acceptUrl,
    })
  } catch (err) {
    // Roll back the invite row so the user can retry cleanly.
    await env.DB.prepare(
      `DELETE FROM workspace_invites WHERE token = ?`,
    )
      .bind(token)
      .run()
    return Response.json(
      {
        error: 'send_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  return Response.json({
    ok: true,
    token,
    expires_at: expiresAt,
    accept_url: acceptUrl,
  })
}

// ── GET /admin/invites?workspace_id=… ────────────────────────────────────

export async function handleListInvites(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const wsId = url.searchParams.get('workspace_id')
  if (!wsId) {
    return Response.json({ error: 'missing_workspace_id' }, { status: 400 })
  }
  const now = Date.now()
  const { results } = await env.DB.prepare(
    `SELECT token, email, role, invited_by, created_at, expires_at,
            accepted_at, revoked_at
     FROM workspace_invites
     WHERE workspace_id = ?
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > ?
     ORDER BY created_at DESC`,
  )
    .bind(wsId, now)
    .all<{
      token: string
      email: string
      role: string
      invited_by: string
      created_at: number
      expires_at: number
      accepted_at: number | null
      revoked_at: number | null
    }>()
  // Don't leak the raw token to the listing — render an opaque id instead.
  // (Caller already has the email + accept_url logic for the original send.)
  return Response.json({
    ok: true,
    invites: (results ?? []).map((r) => ({
      id: r.token.slice(0, 8),
      email: r.email,
      role: r.role,
      invited_by: r.invited_by,
      created_at: r.created_at,
      expires_at: r.expires_at,
    })),
  })
}

// ── POST /admin/invites/redeem ───────────────────────────────────────────

export interface RedeemInviteRequest {
  token: string
  user_id: string
}

export async function handleRedeemInvite(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: RedeemInviteRequest
  try {
    body = (await request.json()) as RedeemInviteRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.token || !body.user_id) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }

  const now = Date.now()
  const invite = await env.DB.prepare(
    `SELECT workspace_id, email, role, invited_by, expires_at, accepted_at, revoked_at
     FROM workspace_invites WHERE token = ?`,
  )
    .bind(body.token)
    .first<{
      workspace_id: string
      email: string
      role: string
      invited_by: string
      expires_at: number
      accepted_at: number | null
      revoked_at: number | null
    }>()

  if (!invite) {
    return Response.json({ error: 'invite_not_found' }, { status: 404 })
  }
  if (invite.accepted_at) {
    return Response.json({ error: 'already_accepted' }, { status: 410 })
  }
  if (invite.revoked_at) {
    return Response.json({ error: 'revoked' }, { status: 410 })
  }
  if (invite.expires_at < now) {
    return Response.json({ error: 'expired' }, { status: 410 })
  }

  // Email gate: the redeeming user's email must match the invite.
  const user = await env.DB.prepare(
    `SELECT email FROM users WHERE id = ?`,
  )
    .bind(body.user_id)
    .first<{ email: string }>()
  if (!user) {
    return Response.json({ error: 'unknown_user' }, { status: 404 })
  }
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return Response.json({ error: 'email_mismatch' }, { status: 403 })
  }

  // Idempotent membership insert + mark accepted.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO workspace_members
       (workspace_id, user_id, role, joined_at, invited_by)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      invite.workspace_id,
      body.user_id,
      invite.role,
      now,
      invite.invited_by,
    ),
    env.DB.prepare(
      `UPDATE workspace_invites SET accepted_at = ? WHERE token = ?`,
    ).bind(now, body.token),
  ])

  return Response.json({
    ok: true,
    workspace_id: invite.workspace_id,
    role: invite.role,
  })
}

// ── DELETE /admin/invites?token=… ────────────────────────────────────────

export async function handleRevokeInvite(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'DELETE' && request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  let token = url.searchParams.get('token') ?? undefined
  if (!token && request.method === 'POST') {
    try {
      const body = (await request.json()) as { token?: string }
      token = body.token
    } catch {
      /* fall through */
    }
  }
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 400 })
  }
  const result = await env.DB.prepare(
    `UPDATE workspace_invites SET revoked_at = ?
     WHERE token = ? AND revoked_at IS NULL AND accepted_at IS NULL`,
  )
    .bind(Date.now(), token)
    .run()
  return Response.json({ ok: true, revoked: result.meta?.changes ?? 0 })
}

// ── GET /admin/invites/inspect?token=… ───────────────────────────────────
// Used by Next.js /invite/[token] page to render context (workspace name,
// inviter email) before the user logs in. NOT admin-secret-protected at
// the row level — but does require the admin secret to call (since this
// endpoint is server-to-server).

export async function handleInspectInvite(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 400 })
  }
  const row = await env.DB.prepare(
    `SELECT i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at,
            i.revoked_at, w.name AS workspace_name, w.slug AS workspace_slug,
            u.email AS inviter_email
     FROM workspace_invites i
     JOIN workspaces w ON w.id = i.workspace_id
     JOIN users u ON u.id = i.invited_by
     WHERE i.token = ?`,
  )
    .bind(token)
    .first<{
      workspace_id: string
      email: string
      role: string
      expires_at: number
      accepted_at: number | null
      revoked_at: number | null
      workspace_name: string
      workspace_slug: string
      inviter_email: string
    }>()
  if (!row) {
    return Response.json({ error: 'invite_not_found' }, { status: 404 })
  }

  const now = Date.now()
  let status: 'pending' | 'accepted' | 'revoked' | 'expired' = 'pending'
  if (row.accepted_at) status = 'accepted'
  else if (row.revoked_at) status = 'revoked'
  else if (row.expires_at < now) status = 'expired'

  return Response.json({
    ok: true,
    invite: {
      email: row.email,
      role: row.role,
      workspace_id: row.workspace_id,
      workspace_name: row.workspace_name,
      workspace_slug: row.workspace_slug,
      inviter_email: row.inviter_email,
      expires_at: row.expires_at,
      status,
    },
  })
}

// ── /admin/workspace-members?workspace_id=… ──────────────────────────────

export async function handleListMembers(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const wsId = url.searchParams.get('workspace_id')
  if (!wsId) {
    return Response.json({ error: 'missing_workspace_id' }, { status: 400 })
  }
  const { results } = await env.DB.prepare(
    `SELECT m.user_id, m.role, m.joined_at, m.invited_by, u.email,
            u.display_name
     FROM workspace_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ?
     ORDER BY m.joined_at ASC`,
  )
    .bind(wsId)
    .all<{
      user_id: string
      role: string
      joined_at: number
      invited_by: string | null
      email: string
      display_name: string | null
    }>()
  return Response.json({ ok: true, members: results ?? [] })
}

// ── DELETE /admin/workspace-members?workspace_id=&user_id= ───────────────

export async function handleRemoveMember(
  request: Request,
  env: InvitesAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'DELETE' && request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  let wsId = url.searchParams.get('workspace_id') ?? undefined
  let userId = url.searchParams.get('user_id') ?? undefined
  if ((!wsId || !userId) && request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        workspace_id?: string
        user_id?: string
      }
      wsId = wsId ?? body.workspace_id
      userId = userId ?? body.user_id
    } catch {
      /* fall through */
    }
  }
  if (!wsId || !userId) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }

  // Refuse to remove the workspace owner — an owner-less workspace is broken.
  const role = await env.DB.prepare(
    `SELECT role FROM workspace_members
     WHERE workspace_id = ? AND user_id = ?`,
  )
    .bind(wsId, userId)
    .first<{ role: string }>()
  if (!role) {
    return Response.json({ error: 'not_a_member' }, { status: 404 })
  }
  if (role.role === 'owner') {
    return Response.json(
      {
        error: 'cannot_remove_owner',
        message:
          'Workspace owners cannot be removed. Transfer ownership first (not yet implemented) or delete the workspace.',
      },
      { status: 409 },
    )
  }

  const result = await env.DB.prepare(
    `DELETE FROM workspace_members
     WHERE workspace_id = ? AND user_id = ? AND role != 'owner'`,
  )
    .bind(wsId, userId)
    .run()
  return Response.json({ ok: true, removed: result.meta?.changes ?? 0 })
}
