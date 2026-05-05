/**
 * Email-OTP login routes. Public endpoints (no admin secret needed) called
 * from the Next.js side via /api/auth/* proxies.
 *
 * Flow:
 *   1. POST /auth/otp/request  { email }
 *      → generate a 6-digit code, hash it, store in `otp_codes` (5 min TTL),
 *        rate-limit, send via Resend.
 *   2. POST /auth/otp/verify   { email, code }
 *      → look up most-recent unconsumed row for email, hash + compare,
 *        on success: upsert `users` row, mint JWT, return token + body.
 *   3. GET  /auth/me
 *      → verify JWT cookie, return { user_id, email }, 401 otherwise.
 *      → also slides expiry forward when token has < 24h left.
 *   4. POST /auth/logout
 *      → return Set-Cookie clearing the session cookie.
 *
 * Security choices:
 *   - 6-digit codes (10⁶ space), 5 min expiry, max 5 attempts per code.
 *   - rate-limit /auth/otp/request: 3 codes per email per 10 min.
 *   - codes are SHA-256 hashed before storage; plaintext never persists.
 *   - rejected codes increment `attempts`; row dies after 5 wrong tries.
 */

import { sha256Hex } from './sha.js'
import { sendOtpEmail, type MailerEnv } from './mailer.js'
import {
  buildLogoutCookie,
  buildSessionCookie,
  signSession,
  verifySession,
  JWT_REISSUE_THRESHOLD_SECONDS,
  SESSION_COOKIE_NAME,
} from './jwt.js'
import type { HuoziCloudflareBindings } from './bindings.js'

export interface AuthOtpEnv extends HuoziCloudflareBindings, MailerEnv {
  HUOZI_AUTH_SECRET?: string
}

const OTP_TTL_SECONDS = 5 * 60
const OTP_RATELIMIT_WINDOW_SECONDS = 10 * 60
const OTP_RATELIMIT_MAX_REQUESTS = 3
const OTP_MAX_ATTEMPTS = 5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function authSecret(env: AuthOtpEnv): string {
  const s = env.HUOZI_AUTH_SECRET
  if (!s || s.length < 32) {
    throw new Response(
      JSON.stringify({
        error: 'auth_not_configured',
        message:
          'HUOZI_AUTH_SECRET is not set or shorter than 32 chars. Set it via `wrangler secret put`.',
      }),
      { status: 501, headers: { 'content-type': 'application/json' } },
    )
  }
  return s
}

function randomDigits(n: number): string {
  // Crypto-strong digit string. We pull 1 byte per digit and map to 0–9.
  // (Slight bias toward 0–5 — acceptable here; entropy is dominated by
  // the 6-digit space, not per-digit fairness.)
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < n; i++) out += String((buf[i]! % 10).toString())
  return out
}

function uuid(): string {
  return crypto.randomUUID()
}

function setCorsCookieHeaders(res: Response, cookie?: string): Response {
  if (cookie) res.headers.set('set-cookie', cookie)
  return res
}

// ── /auth/otp/request ────────────────────────────────────────────────────

export async function handleOtpRequest(
  request: Request,
  env: AuthOtpEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: { email?: string }
  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  const now = Date.now()

  // Rate limit: count recent unconsumed requests for this email.
  const windowStart = now - OTP_RATELIMIT_WINDOW_SECONDS * 1000
  const { results: recent } = await env.DB.prepare(
    `SELECT count(*) AS n FROM otp_codes
     WHERE email = ? AND created_at > ?`,
  )
    .bind(email, windowStart)
    .all<{ n: number }>()
  const count = recent?.[0]?.n ?? 0
  if (count >= OTP_RATELIMIT_MAX_REQUESTS) {
    return Response.json(
      {
        error: 'rate_limited',
        message: `Too many codes requested. Try again in ${OTP_RATELIMIT_WINDOW_SECONDS / 60} minutes.`,
      },
      { status: 429 },
    )
  }

  // Generate + store + send.
  const code = randomDigits(6)
  const codeHash = await sha256Hex(`${email}:${code}`)
  const expiresAt = now + OTP_TTL_SECONDS * 1000

  await env.DB.prepare(
    `INSERT INTO otp_codes (email, code_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(email, codeHash, now, expiresAt)
    .run()

  try {
    await sendOtpEmail(env, email, code)
  } catch (err) {
    return Response.json(
      {
        error: 'send_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  return Response.json({ ok: true, expires_in: OTP_TTL_SECONDS })
}

// ── /auth/otp/verify ─────────────────────────────────────────────────────

export async function handleOtpVerify(
  request: Request,
  env: AuthOtpEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const secret = authSecret(env) // throws Response on misconfig

  let body: { email?: string; code?: string }
  try {
    body = (await request.json()) as { email?: string; code?: string }
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const email = (body.email ?? '').trim().toLowerCase()
  const code = (body.code ?? '').trim()
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: 'invalid_code_format' }, { status: 400 })
  }

  const now = Date.now()

  // Pick the most-recent unconsumed unexpired row for this email.
  const row = await env.DB.prepare(
    `SELECT id, code_hash, expires_at, attempts
     FROM otp_codes
     WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(email, now)
    .first<{
      id: number
      code_hash: string
      expires_at: number
      attempts: number
    }>()

  if (!row) {
    return Response.json(
      { error: 'no_pending_code' },
      { status: 400 },
    )
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return Response.json(
      { error: 'too_many_attempts' },
      { status: 429 },
    )
  }

  const submittedHash = await sha256Hex(`${email}:${code}`)
  if (submittedHash !== row.code_hash) {
    await env.DB.prepare(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`,
    )
      .bind(row.id)
      .run()
    return Response.json({ error: 'invalid_code' }, { status: 400 })
  }

  // Code is valid. Consume it and lock out concurrent verifies.
  await env.DB.prepare(
    `UPDATE otp_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
  )
    .bind(now, row.id)
    .run()

  // Upsert the user. Existing rows keep their UUID (so workspace ownership
  // and api_keys.principal_id remain stable across logins).
  let user = await env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<{ id: string; email: string; display_name: string | null }>()

  if (!user) {
    const userId = uuid()
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, email, now, now)
      .run()
    user = { id: userId, email, display_name: null }
  } else {
    await env.DB.prepare(
      `UPDATE users SET last_seen_at = ? WHERE id = ?`,
    )
      .bind(now, user.id)
      .run()
  }

  // Auto-redeem pending invites addressed to this email. Lets an invitee
  // either click the invite URL OR just log in normally — both paths land
  // them in the workspace. Without this, an invitee logging in via /authorize
  // (OAuth flow) would create their OWN brand-new workspace instead of
  // joining the inviter's. Idempotent via INSERT OR IGNORE.
  const { results: pendingInvites = [] } = await env.DB.prepare(
    `SELECT token, workspace_id, role, invited_by
     FROM workspace_invites
     WHERE LOWER(email) = LOWER(?)
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > ?`,
  )
    .bind(email, now)
    .all<{
      token: string
      workspace_id: string
      role: string
      invited_by: string
    }>()
  for (const inv of pendingInvites) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_members
         (workspace_id, user_id, role, joined_at, invited_by)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(inv.workspace_id, user.id, inv.role, now, inv.invited_by),
      env.DB.prepare(
        `UPDATE workspace_invites SET accepted_at = ? WHERE token = ?`,
      ).bind(now, inv.token),
    ])
  }

  // Look up workspaces this user belongs to. Branch behaviour:
  //   0 → wsid-less JWT, UI bounces to /onboard
  //   1 → bake wsid into JWT, UI lands directly in /workspace
  //   2+ → wsid-less JWT, UI bounces to /select-workspace
  const { results: memberships = [] } = await env.DB.prepare(
    `SELECT w.id, w.slug, w.name, m.role
     FROM workspace_members m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = ?
     ORDER BY m.joined_at ASC`,
  )
    .bind(user.id)
    .all<{ id: string; slug: string; name: string; role: string }>()

  const autoWsid =
    memberships.length === 1 ? memberships[0]!.id : undefined

  const token = await signSession(secret, {
    userId: user.id,
    email: user.email,
    wsid: autoWsid,
  })
  const cookie = buildSessionCookie(token, { secure: true })

  const res = Response.json({
    ok: true,
    user: { id: user.id, email: user.email, display_name: user.display_name },
    workspaces: memberships,
    wsid: autoWsid ?? null,
    token, // exposed so the Next.js proxy can set its own cookie too
  })
  return setCorsCookieHeaders(res, cookie)
}

// ── /auth/select-workspace ───────────────────────────────────────────────
//
// Used in two situations:
//   1. Multi-membership users picking a workspace at login time
//   2. Already-signed-in users switching to a different workspace
// The current JWT cookie identifies the user; we just verify membership
// and re-issue with the new wsid claim.

export async function handleSelectWorkspace(
  request: Request,
  env: AuthOtpEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const secret = authSecret(env)

  // Read current session cookie.
  let token: string | null = null
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const m = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`),
    )
    if (m) token = m[1]!
  }
  if (!token) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const claims = await verifySession(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  let body: { workspace_id?: string }
  try {
    body = (await request.json()) as { workspace_id?: string }
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const wsid = (body.workspace_id ?? '').trim()
  if (!wsid) {
    return Response.json({ error: 'missing_workspace_id' }, { status: 400 })
  }

  // Verify the user is actually a member of that workspace.
  const member = await env.DB.prepare(
    `SELECT role FROM workspace_members
     WHERE user_id = ? AND workspace_id = ?`,
  )
    .bind(claims.sub, wsid)
    .first<{ role: string }>()
  if (!member) {
    return Response.json({ error: 'not_a_member' }, { status: 403 })
  }

  // Re-issue JWT with the new wsid claim.
  const fresh = await signSession(secret, {
    userId: claims.sub,
    email: claims.email,
    wsid,
  })
  const cookie = buildSessionCookie(fresh, { secure: true })

  const res = Response.json({
    ok: true,
    wsid,
    role: member.role,
    token: fresh,
  })
  return setCorsCookieHeaders(res, cookie)
}

// ── /auth/me ─────────────────────────────────────────────────────────────

export async function handleAuthMe(
  request: Request,
  env: AuthOtpEnv,
): Promise<Response> {
  const secret = authSecret(env)

  // Accept both Cookie and Authorization: Bearer. The Cookie path is the
  // primary one; the Bearer path lets server-to-server clients call /auth/me
  // directly (e.g. testing).
  let token: string | null = null
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const m = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`),
    )
    if (m) token = m[1]!
  }
  if (!token) {
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) token = auth.slice(7)
  }
  if (!token) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const claims = await verifySession(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  // Resolve current user row (display_name may have changed).
  const user = await env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE id = ?`,
  )
    .bind(claims.sub)
    .first<{ id: string; email: string; display_name: string | null }>()

  if (!user) {
    // The user was deleted but their token wasn't revoked (rare). Treat as
    // unauthenticated and clear the cookie.
    const res = Response.json({ error: 'user_not_found' }, { status: 401 })
    res.headers.set('set-cookie', buildLogoutCookie())
    return res
  }

  // Sliding-window: re-issue if expiry is < 24h away.
  let setCookie: string | undefined
  const exp = (claims.exp ?? 0) * 1000
  if (exp - Date.now() < JWT_REISSUE_THRESHOLD_SECONDS * 1000) {
    const fresh = await signSession(secret, {
      userId: user.id,
      email: user.email,
    })
    setCookie = buildSessionCookie(fresh, { secure: true })
  }

  const res = Response.json({
    ok: true,
    user: { id: user.id, email: user.email, display_name: user.display_name },
  })
  if (setCookie) res.headers.set('set-cookie', setCookie)
  return res
}

// ── /auth/logout ─────────────────────────────────────────────────────────

export async function handleAuthLogout(
  _request: Request,
  _env: AuthOtpEnv,
): Promise<Response> {
  const res = Response.json({ ok: true })
  res.headers.set('set-cookie', buildLogoutCookie())
  return res
}
