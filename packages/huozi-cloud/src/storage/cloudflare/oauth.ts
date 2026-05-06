/**
 * OAuth 2.1 + PKCE primary auth path for MCP clients.
 *
 * Endpoints we expose:
 *
 *   Public (no auth):
 *     GET  /.well-known/oauth-authorization-server   → RFC 8414 metadata
 *     GET  /.well-known/oauth-protected-resource     → RFC 9728 (for /mcp)
 *     POST /oauth/register                           → RFC 7591 DCR
 *     GET  /oauth/authorize                          → 302 to Next.js /authorize
 *     POST /oauth/token                              → grant=authorization_code | refresh_token
 *
 *   Admin (X-Admin-Secret; called by Next.js /authorize page):
 *     POST /admin/oauth/inspect-pending              → fetch client+scope by session
 *     POST /admin/oauth/approve                      → mint auth_code + return redirect URL
 *     POST /admin/oauth/deny                         → return error redirect URL
 *
 * Token shapes:
 *   - Access: oat_<48hex> — stored as api_keys row (Bearer at /mcp works unchanged)
 *   - Refresh: ort_<48hex> — stored as oauth_refresh_tokens row, only used at /oauth/token
 *
 * PKCE: only S256 is accepted. `plain` is forbidden by spec for new servers.
 *
 * Lifecycle:
 *   register(client_name, redirect_uris)         ─► client_id
 *   authorize?client_id&code_challenge&...       ─► 302 to /authorize?session=…
 *   user consents at /authorize                   ─► server INSERT auth_code
 *   redirect to redirect_uri?code=&state=        ─► agent picks up code
 *   token(code, code_verifier)                   ─► access_token + refresh_token
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { sha256Hex } from './sha.js'
import { assertAdminAuth, type AdminEnv } from './admin.js'
import { validatePrincipalAndWorkspace } from './api-keys-validate.js'

// ── Config ──────────────────────────────────────────────────────────────

/** Authorize-page session lifetime — must accommodate OTP-login + consent. */
const PENDING_TTL_SECONDS = 15 * 60
/** Auth-code lifetime — single-use, short by spec. */
const CODE_TTL_SECONDS = 60
/** Access-token lifetime. Short = small blast radius if token leaks. */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
/** Refresh-token lifetime. Long enough that day-to-day use never re-prompts. */
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

// ── Helpers ─────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

/** Base64url(SHA-256(input)) — what PKCE expects to compare against. */
async function s256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function publicBase(env: HuoziCloudflareBindings): string {
  return (env.HUOZI_PUBLIC_BASE ?? 'https://huozi.app').replace(/\/+$/, '')
}

/** Try to identify which schema this token uses without a DB roundtrip. */
export function isOAuthAccessToken(token: string): boolean {
  return token.startsWith('oat_')
}

/** Append params to a URL — preserving any existing query-string the client
 *  put in their redirect_uri at registration time. */
function appendParams(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) u.searchParams.set(k, v)
  }
  return u.toString()
}

/** Constant-time-ish equality for short hex/base64url strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── /.well-known/oauth-authorization-server (RFC 8414) ──────────────────

export function handleOauthMetadata(
  _request: Request,
  env: HuoziCloudflareBindings,
): Response {
  // Issuer == this worker's public URL. Most discovery clients normalize
  // trailing slashes; we don't include one.
  const issuer = publicBase(env)
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      // RFC 8628 device authorization grant. Endpoint takes
      //   POST { client_name?, agent_kind? }  → { device_code, user_code,
      //   verification_url, verification_url_complete, expires_in,
      //   interval }
      // Token poll happens at token_endpoint with
      //   grant_type=urn:ietf:params:oauth:grant-type:device_code
      // (form-encoded). Lets MCP clients that support device flow auto-
      // discover and use it when localhost callback isn't viable.
      device_authorization_endpoint: `${issuer}/auth/device-code`,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
      service_documentation: `${issuer}/start`,
    },
    {
      headers: {
        'cache-control': 'public, max-age=300',
        'access-control-allow-origin': '*',
      },
    },
  )
}

// ── /.well-known/oauth-protected-resource (RFC 9728) ────────────────────

export function handleProtectedResourceMetadata(
  _request: Request,
  env: HuoziCloudflareBindings,
): Response {
  const issuer = publicBase(env)
  return Response.json(
    {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${issuer}/start`,
    },
    {
      headers: {
        'cache-control': 'public, max-age=300',
        'access-control-allow-origin': '*',
      },
    },
  )
}

// ── POST /oauth/register (RFC 7591 Dynamic Client Registration) ─────────

interface RegisterBody {
  client_name?: string
  client_uri?: string
  redirect_uris?: string[]
  grant_types?: string[]
  token_endpoint_auth_method?: string
  scope?: string
  /** RFC 7591 alias some clients send. */
  application_type?: string
}

export async function handleOauthRegister(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return jsonError('invalid_client_metadata', 'request body must be JSON', 400)
  }

  // Spec calls redirect_uris REQUIRED for confidential or public clients
  // doing the auth-code flow, which is the only flow we support.
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (redirectUris.length === 0) {
    return jsonError(
      'invalid_redirect_uri',
      'redirect_uris is required and must be a non-empty array',
      400,
    )
  }
  for (const u of redirectUris) {
    if (typeof u !== 'string' || u.length > 2048) {
      return jsonError('invalid_redirect_uri', 'redirect_uris must be strings ≤ 2048 chars', 400)
    }
    try {
      const parsed = new URL(u)
      // RFC 8252 allows three redirect-URI patterns for native apps:
      //   1. Claimed HTTPS scheme        (https://app.example.com/cb)
      //   2. Loopback IP                 (http://127.0.0.1:port/cb)
      //   3. Private-use URI scheme      (cursor://…, com.example.app://…)
      // We reject http://* on non-loopback hosts and a denylist of schemes
      // that are dangerous as redirect targets (XSS / data exfil vectors).
      const proto = parsed.protocol
      const isHttps = proto === 'https:'
      const isLoopback =
        proto === 'http:' &&
        (parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '::1')
      const isPlainHttp = proto === 'http:' && !isLoopback
      const dangerousSchemes = new Set([
        'javascript:',
        'data:',
        'vbscript:',
        'file:',
        'about:',
        'blob:',
      ])
      if (isPlainHttp) {
        return jsonError(
          'invalid_redirect_uri',
          `redirect_uri ${u} must be https:// (or http://localhost for dev)`,
          400,
        )
      }
      if (dangerousSchemes.has(proto)) {
        return jsonError(
          'invalid_redirect_uri',
          `redirect_uri scheme ${proto} is not allowed`,
          400,
        )
      }
      if (!isHttps && !isLoopback) {
        // Private-use URI scheme (RFC 8252 §7.1). Require a non-empty scheme
        // followed by a colon — URL parser already enforced that. Disallow
        // bare schemes (no authority/path) since those can't carry a code.
        if (!parsed.pathname && !parsed.host && !parsed.hostname) {
          return jsonError(
            'invalid_redirect_uri',
            `redirect_uri ${u} has no path or authority`,
            400,
          )
        }
      }
    } catch {
      return jsonError('invalid_redirect_uri', `redirect_uri ${u} is not a URL`, 400)
    }
  }

  // We only implement public-client PKCE — refuse 'client_secret_basic' &c.
  // and refuse grant types beyond the two we support.
  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.length > 0
      ? body.grant_types
      : ['authorization_code', 'refresh_token']
  for (const g of grantTypes) {
    if (g !== 'authorization_code' && g !== 'refresh_token') {
      return jsonError(
        'invalid_client_metadata',
        `grant_type ${g} not supported (only authorization_code, refresh_token)`,
        400,
      )
    }
  }
  const tokenAuthMethod = body.token_endpoint_auth_method ?? 'none'
  if (tokenAuthMethod !== 'none') {
    return jsonError(
      'invalid_client_metadata',
      'this server only supports token_endpoint_auth_method=none (PKCE public client)',
      400,
    )
  }

  const clientId = `mcpc_${randomHex(12)}` // mcpc = MCP client
  const now = Date.now()

  await env.DB.prepare(
    `INSERT INTO oauth_clients
     (client_id, client_name, client_uri, redirect_uris, grant_types,
      token_endpoint_auth_method, scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      clientId,
      typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : null,
      typeof body.client_uri === 'string' ? body.client_uri.slice(0, 500) : null,
      JSON.stringify(redirectUris),
      JSON.stringify(grantTypes),
      tokenAuthMethod,
      typeof body.scope === 'string' ? body.scope.slice(0, 200) : null,
      now,
    )
    .run()

  // RFC 7591: omit optional metadata fields the client didn't provide
  // (rather than echoing back `null`). Strict OAuth clients (Claude Code,
  // Hermes) Zod-validate the response and reject {field: null} when the
  // schema is `string | undefined`.
  const out: Record<string, unknown> = {
    client_id: clientId,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(now / 1000),
  }
  if (typeof body.client_name === 'string') out.client_name = body.client_name
  if (typeof body.client_uri === 'string') out.client_uri = body.client_uri
  if (typeof body.scope === 'string') out.scope = body.scope
  return Response.json(out)
}

// ── GET /oauth/authorize ────────────────────────────────────────────────
//
// Agent's browser arrives here with all the OAuth params. We persist them
// under a server-side session_id and redirect the browser to the Next.js
// /authorize page — the user logs in (if needed) and consents there.

export async function handleOauthAuthorize(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const params = url.searchParams

  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const responseType = params.get('response_type') ?? ''
  const codeChallenge = params.get('code_challenge') ?? ''
  const codeChallengeMethod = params.get('code_challenge_method') ?? 'S256'
  const scope = params.get('scope')
  const state = params.get('state')

  // Critical errors NOT redirected — RFC 6749 §4.1.2.1 says client_id /
  // redirect_uri errors must be presented directly to the user, not the
  // client (otherwise we'd be a phishing relay).
  if (!clientId) {
    return htmlError(env, 400, 'missing client_id')
  }
  const clientRow = await env.DB.prepare(
    `SELECT redirect_uris, client_name FROM oauth_clients WHERE client_id = ?`,
  )
    .bind(clientId)
    .first<{ redirect_uris: string; client_name: string | null }>()
  if (!clientRow) {
    return htmlError(env, 400, `unknown client_id: ${clientId}`)
  }
  const registeredUris = (() => {
    try {
      const parsed = JSON.parse(clientRow.redirect_uris)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return [] as string[]
    }
  })()
  if (!redirectUri || !registeredUris.includes(redirectUri)) {
    return htmlError(
      env,
      400,
      `redirect_uri ${redirectUri || '(missing)'} not registered for this client`,
    )
  }

  // Errors we CAN safely bounce back to the client (params present + valid
  // redirect, but otherwise non-conformant).
  if (responseType !== 'code') {
    return Response.redirect(
      appendParams(redirectUri, {
        error: 'unsupported_response_type',
        error_description: `only response_type=code is supported`,
        state: state ?? undefined,
      }),
      302,
    )
  }
  if (!codeChallenge) {
    return Response.redirect(
      appendParams(redirectUri, {
        error: 'invalid_request',
        error_description: 'PKCE code_challenge is required',
        state: state ?? undefined,
      }),
      302,
    )
  }
  if (codeChallengeMethod !== 'S256') {
    return Response.redirect(
      appendParams(redirectUri, {
        error: 'invalid_request',
        error_description: `code_challenge_method=${codeChallengeMethod} not supported (use S256)`,
        state: state ?? undefined,
      }),
      302,
    )
  }

  // All good — persist the request and bounce to the consent page.
  const sessionId = randomHex(16)
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO oauth_pending_authorizations
     (session_id, client_id, redirect_uri, scope, state,
      code_challenge, code_challenge_method, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      now,
      now + PENDING_TTL_SECONDS * 1000,
    )
    .run()

  const consentUrl = `${publicBase(env)}/authorize?session=${encodeURIComponent(sessionId)}`
  return Response.redirect(consentUrl, 302)
}

// ── POST /admin/oauth/inspect-pending ───────────────────────────────────
//
// Next.js /authorize page calls this with the session_id from the URL to
// render the consent screen ("Cursor wants to access workspace X").

export async function handleOauthInspectPending(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: { session_id?: string }
  try {
    body = (await request.json()) as { session_id?: string }
  } catch {
    return jsonError('invalid_json', '', 400)
  }
  const sessionId = (body.session_id ?? '').trim()
  if (!sessionId) {
    return jsonError('missing_session_id', '', 400)
  }
  const row = await env.DB.prepare(
    `SELECT p.*, c.client_name, c.client_uri
     FROM oauth_pending_authorizations p
     LEFT JOIN oauth_clients c ON c.client_id = p.client_id
     WHERE p.session_id = ?`,
  )
    .bind(sessionId)
    .first<{
      session_id: string
      client_id: string
      redirect_uri: string
      scope: string | null
      state: string | null
      created_at: number
      expires_at: number
      consumed_at: number | null
      client_name: string | null
      client_uri: string | null
    }>()
  if (!row) {
    return jsonError('not_found', 'session expired or never existed', 404)
  }
  if (row.consumed_at) {
    return jsonError('already_consumed', '', 410)
  }
  if (row.expires_at < Date.now()) {
    return jsonError('expired', '', 410)
  }
  return Response.json({
    session_id: row.session_id,
    client_id: row.client_id,
    client_name: row.client_name,
    client_uri: row.client_uri,
    redirect_uri: row.redirect_uri,
    scope: row.scope,
    state: row.state,
    expires_at: row.expires_at,
  })
}

// ── POST /admin/oauth/approve ────────────────────────────────────────────
//
// Next.js calls this AFTER the user has logged in and clicked "Authorize".
// Body: { session_id, user_id, workspace_id, agent_kind?, label? }
// Returns: { redirect_url } — Next.js does the actual 302.

interface ApproveBody {
  session_id?: string
  user_id?: string
  workspace_id?: string
  agent_kind?: string
  label?: string
}

export async function handleOauthApprove(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: ApproveBody
  try {
    body = (await request.json()) as ApproveBody
  } catch {
    return jsonError('invalid_json', '', 400)
  }
  const sessionId = (body.session_id ?? '').trim()
  const userId = (body.user_id ?? '').trim()
  const workspaceId = (body.workspace_id ?? '').trim()
  if (!sessionId || !userId || !workspaceId) {
    return jsonError('missing_fields', 'session_id, user_id, workspace_id required', 400)
  }
  if (!workspaceId.startsWith('ws_')) {
    return jsonError('invalid_workspace_id', `expected ws_<slug>, got ${workspaceId}`, 400)
  }

  const pending = await env.DB.prepare(
    `SELECT * FROM oauth_pending_authorizations WHERE session_id = ?`,
  )
    .bind(sessionId)
    .first<{
      session_id: string
      client_id: string
      redirect_uri: string
      scope: string | null
      state: string | null
      code_challenge: string
      code_challenge_method: string
      expires_at: number
      consumed_at: number | null
    }>()
  if (!pending) return jsonError('session_not_found', '', 404)
  if (pending.consumed_at) return jsonError('already_consumed', '', 410)
  if (pending.expires_at < Date.now()) return jsonError('expired', '', 410)

  // Sanity: the user_id + workspace must reference real rows. Reuses the
  // same validator the mint-key path uses, so any "ghost workspace" bug
  // surfaces here too.
  const ref = await validatePrincipalAndWorkspace(env, {
    principalType: 'agent',
    principalId: userId,
    workspaceId,
  })
  if (!ref.ok) {
    return jsonError(ref.error, ref.field, 400)
  }

  // Mint the auth_code.
  const code = randomHex(24)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO oauth_authorization_codes
       (code, client_id, user_id, workspace_id, redirect_uri, scope,
        code_challenge, code_challenge_method, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      code,
      pending.client_id,
      userId,
      workspaceId,
      pending.redirect_uri,
      pending.scope,
      pending.code_challenge,
      pending.code_challenge_method,
      now,
      now + CODE_TTL_SECONDS * 1000,
    ),
    env.DB.prepare(
      `UPDATE oauth_pending_authorizations SET consumed_at = ? WHERE session_id = ?`,
    ).bind(now, sessionId),
    env.DB.prepare(
      `UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?`,
    ).bind(now, pending.client_id),
  ])

  const redirectUrl = appendParams(pending.redirect_uri, {
    code,
    state: pending.state ?? undefined,
  })
  // Stash agent_kind / label on the session for use by /token (we'll fold
  // them into the api_keys.name when we mint the access token below).
  // Lightweight side channel: we re-use the consumed pending row's `state`
  // field… actually no — we'll persist via a metadata column, but adding
  // a column for this is overkill. Instead, store on the auth code row
  // by extending the table later. For v1, mint with a sensible default.
  void body.agent_kind
  void body.label
  return Response.json({ redirect_url: redirectUrl })
}

// ── POST /admin/oauth/deny ───────────────────────────────────────────────

export async function handleOauthDeny(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let body: { session_id?: string; error?: string }
  try {
    body = (await request.json()) as { session_id?: string; error?: string }
  } catch {
    return jsonError('invalid_json', '', 400)
  }
  const sessionId = (body.session_id ?? '').trim()
  if (!sessionId) return jsonError('missing_session_id', '', 400)

  const pending = await env.DB.prepare(
    `SELECT redirect_uri, state, consumed_at FROM oauth_pending_authorizations
     WHERE session_id = ?`,
  )
    .bind(sessionId)
    .first<{ redirect_uri: string; state: string | null; consumed_at: number | null }>()
  if (!pending) return jsonError('session_not_found', '', 404)
  if (pending.consumed_at) return jsonError('already_consumed', '', 410)

  await env.DB.prepare(
    `UPDATE oauth_pending_authorizations SET consumed_at = ? WHERE session_id = ?`,
  )
    .bind(Date.now(), sessionId)
    .run()

  const redirectUrl = appendParams(pending.redirect_uri, {
    error: body.error ?? 'access_denied',
    error_description: 'user denied authorization',
    state: pending.state ?? undefined,
  })
  return Response.json({ redirect_url: redirectUrl })
}

// ── POST /oauth/token ────────────────────────────────────────────────────
//
// Two grants:
//   - authorization_code: redeem an auth_code for tokens (PKCE-validated)
//   - refresh_token:      rotate a refresh_token; mint a new access_token

interface TokenBody {
  grant_type?: string
  // auth_code grant
  code?: string
  redirect_uri?: string
  client_id?: string
  code_verifier?: string
  // refresh grant
  refresh_token?: string
  // RFC 8628 device flow grant
  device_code?: string
}

export async function handleOauthToken(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // Per spec, /token accepts application/x-www-form-urlencoded. JSON is
  // also tolerated by most servers for ergonomics; we accept either.
  let body: TokenBody = {}
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    try {
      body = (await request.json()) as TokenBody
    } catch {
      return jsonError('invalid_request', 'invalid JSON body', 400)
    }
  } else {
    const form = await request.formData().catch(() => null)
    if (form) {
      const obj: Record<string, string> = {}
      form.forEach((v, k) => {
        obj[k] = String(v)
      })
      body = obj as TokenBody
    }
  }

  if (body.grant_type === 'authorization_code') {
    return handleAuthCodeGrant(body, env)
  }
  if (body.grant_type === 'refresh_token') {
    return handleRefreshGrant(body, env)
  }
  if (body.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
    return handleDeviceCodeGrant(body, env)
  }
  return jsonError(
    'unsupported_grant_type',
    `grant_type=${body.grant_type ?? '(missing)'} not supported`,
    400,
  )
}

// ── Device-code grant (RFC 8628) ─────────────────────────────────────────
//
// Companion to /auth/device-code: a client polling the standardized
// token_endpoint with the device-code grant. The legacy /auth/token
// JSON endpoint is preserved separately for our chat-mode Agent prompts
// (it returns the static api_key directly so the Agent can splice it
// into a config file). This grant returns the OAuth-shape envelope —
// `{access_token, token_type, expires_in}` — so MCP clients that
// auto-discover RFC 8628 from /.well-known/oauth-authorization-server
// can use it without bespoke wiring.
//
// Trade-off: the access_token returned here IS the same `hz_*` static
// api_key minted by /admin/device-authorize, just wrapped in the OAuth
// shape. So `expires_in` is omitted (api_key has no TTL by default) and
// no refresh_token is issued (static keys don't rotate). Clients that
// need short-lived rotating tokens should use the authorization_code
// grant instead. If we ever switch device flow to true OAuth-issued
// access_tokens, the change is contained to this function plus the
// admin authorize handler — `/auth/token` JSON polling stays put for
// the chat Agent flow.
async function handleDeviceCodeGrant(
  body: TokenBody,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  const deviceCode = (body.device_code ?? '').trim()
  if (!deviceCode || !/^[a-f0-9]{48}$/.test(deviceCode)) {
    return jsonError('invalid_grant', 'invalid device_code', 400)
  }

  const row = await env.DB.prepare(
    `SELECT * FROM device_grants WHERE device_code = ?`,
  )
    .bind(deviceCode)
    .first<{
      device_code: string
      user_code: string
      status: 'pending' | 'authorized' | 'denied' | 'expired' | 'consumed'
      api_key: string | null
      api_key_id: string | null
      created_at: number
      expires_at: number
    }>()
  if (!row) {
    return jsonError('invalid_grant', 'device_code not found', 400)
  }

  const now = Date.now()

  if (row.status === 'pending' && row.expires_at < now) {
    await env.DB.prepare(
      `UPDATE device_grants SET status='expired' WHERE device_code = ?`,
    )
      .bind(deviceCode)
      .run()
    return jsonError('expired_token', 'device code expired', 400)
  }
  if (row.status === 'pending') {
    // RFC 8628 §3.5: server SHOULD respond with `authorization_pending`
    // and the client SHOULD respect the `interval` returned at start.
    return jsonError('authorization_pending', 'user has not completed authorization yet', 400)
  }
  if (row.status === 'denied') {
    return jsonError('access_denied', 'user denied authorization', 400)
  }
  if (row.status === 'expired') {
    return jsonError('expired_token', 'device code expired', 400)
  }
  if (row.status === 'consumed') {
    // Either the legacy /auth/token JSON endpoint already consumed it,
    // or this is a replay after a successful poll. Either way, the
    // backing api_key has been scrubbed — we can't deliver again.
    return jsonError('expired_token', 'device code already consumed', 400)
  }

  // status === 'authorized'. Atomic consume + scrub.
  if (!row.api_key) {
    return jsonError('server_error', 'missing api_key on authorized grant', 500)
  }
  const accessToken = row.api_key
  const scrubRes = await env.DB.prepare(
    `UPDATE device_grants
     SET status='consumed', consumed_at=?, api_key=NULL
     WHERE device_code = ? AND status='authorized'`,
  )
    .bind(now, deviceCode)
    .run()
  const changes = scrubRes.meta?.changes ?? 0
  if (changes === 0) {
    // Raced with /auth/token JSON polling.
    return jsonError('expired_token', 'device code already consumed', 400)
  }

  return Response.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      scope: 'mcp',
    },
    {
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
      },
    },
  )
}

async function handleAuthCodeGrant(
  body: TokenBody,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  const code = (body.code ?? '').trim()
  const clientId = (body.client_id ?? '').trim()
  const redirectUri = (body.redirect_uri ?? '').trim()
  const codeVerifier = (body.code_verifier ?? '').trim()
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return jsonError('invalid_request', 'code, client_id, redirect_uri, code_verifier are required', 400)
  }

  const row = await env.DB.prepare(
    `SELECT * FROM oauth_authorization_codes WHERE code = ?`,
  )
    .bind(code)
    .first<{
      code: string
      client_id: string
      user_id: string
      workspace_id: string
      redirect_uri: string
      scope: string | null
      code_challenge: string
      code_challenge_method: string
      expires_at: number
      consumed_at: number | null
    }>()
  if (!row) return jsonError('invalid_grant', 'code not found', 400)
  if (row.consumed_at) {
    // Replay: spec says we MUST also revoke any tokens issued from this code.
    // For v1, we just refuse — token-leak detection sits on top of refresh-
    // rotation chains, where it's more actionable.
    return jsonError('invalid_grant', 'code already used', 400)
  }
  if (row.expires_at < Date.now()) {
    return jsonError('invalid_grant', 'code expired', 400)
  }
  if (row.client_id !== clientId) {
    return jsonError('invalid_grant', 'client_id does not match issued code', 400)
  }
  if (row.redirect_uri !== redirectUri) {
    return jsonError('invalid_grant', 'redirect_uri does not match issued code', 400)
  }

  // PKCE check.
  const computed = await s256Challenge(codeVerifier)
  if (!timingSafeEqual(computed, row.code_challenge)) {
    return jsonError('invalid_grant', 'code_verifier does not match code_challenge', 400)
  }

  // Mark the code consumed FIRST (best-effort linearization: if we crash
  // after mint but before this UPDATE, the code's still single-use because
  // the next attempt would race the same UPDATE).
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE oauth_authorization_codes SET consumed_at = ? WHERE code = ?`,
  )
    .bind(now, code)
    .run()

  // Look up client name to label the access_token.
  const client = await env.DB.prepare(
    `SELECT client_name FROM oauth_clients WHERE client_id = ?`,
  )
    .bind(clientId)
    .first<{ client_name: string | null }>()

  // Mint access_token (api_keys row).
  const accessKeyId = `oak_${randomHex(8)}`
  const accessToken = `oat_${randomHex(24)}`
  const accessHash = await sha256Hex(accessToken)
  const accessExpiresAt = now + ACCESS_TOKEN_TTL_SECONDS * 1000

  // Mint refresh_token.
  const refreshToken = `ort_${randomHex(24)}`
  const refreshHash = await sha256Hex(refreshToken)
  const refreshExpiresAt = now + REFRESH_TOKEN_TTL_SECONDS * 1000

  // Mint with just `[<kind>]` — the renderer derives the bold display
  // name from the kind taxonomy, and the client_name suffix here was
  // pure noise (e.g. "[claude-code] Claude Code (huozi)" produced a
  // redundant "huozi" subtitle in the UI).
  const labelKind = inferAgentKind(client?.client_name ?? null)
  const apiKeyName = `[${labelKind}]`

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO api_keys
       (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id,
        created_at, expires_at, ttl_seconds, name, oauth_client_id)
       VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      accessKeyId,
      accessHash,
      row.workspace_id,
      null,
      row.user_id,
      now,
      accessExpiresAt,
      ACCESS_TOKEN_TTL_SECONDS,
      apiKeyName,
      clientId,
    ),
    env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
       (token_hash, client_id, user_id, workspace_id, scope,
        current_access_key_id, previous_token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).bind(
      refreshHash,
      clientId,
      row.user_id,
      row.workspace_id,
      row.scope,
      accessKeyId,
      now,
      refreshExpiresAt,
    ),
  ])

  return Response.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: row.scope ?? 'mcp',
    },
    {
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
      },
    },
  )
}

async function handleRefreshGrant(
  body: TokenBody,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  const refreshToken = (body.refresh_token ?? '').trim()
  const clientId = (body.client_id ?? '').trim()
  if (!refreshToken || !clientId) {
    return jsonError('invalid_request', 'refresh_token and client_id required', 400)
  }
  const refreshHash = await sha256Hex(refreshToken)
  const row = await env.DB.prepare(
    `SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?`,
  )
    .bind(refreshHash)
    .first<{
      token_hash: string
      client_id: string
      user_id: string
      workspace_id: string
      scope: string | null
      current_access_key_id: string | null
      previous_token_hash: string | null
      created_at: number
      expires_at: number
      revoked_at: number | null
    }>()
  if (!row) return jsonError('invalid_grant', 'refresh_token not found', 400)
  if (row.revoked_at) {
    // Replay-after-revoke. RFC 6819 §5.2.2.3: kill the entire chain and
    // any access_token issued from it. Here we just nuke the chain — the
    // access tokens themselves expire on their own (1 h TTL).
    await invalidateRefreshChain(env, refreshHash)
    return jsonError('invalid_grant', 'refresh_token revoked (chain killed)', 400)
  }
  if (row.expires_at < Date.now()) {
    return jsonError('invalid_grant', 'refresh_token expired', 400)
  }
  if (row.client_id !== clientId) {
    return jsonError('invalid_grant', 'client_id mismatch', 400)
  }

  const now = Date.now()
  // Rotate: mint new refresh + new access, mark old refresh revoked.
  const newAccessKeyId = `oak_${randomHex(8)}`
  const newAccessToken = `oat_${randomHex(24)}`
  const newAccessHash = await sha256Hex(newAccessToken)
  const newAccessExpiresAt = now + ACCESS_TOKEN_TTL_SECONDS * 1000

  const newRefreshToken = `ort_${randomHex(24)}`
  const newRefreshHash = await sha256Hex(newRefreshToken)
  const newRefreshExpiresAt = now + REFRESH_TOKEN_TTL_SECONDS * 1000

  // Look up client_name for label continuity.
  const client = await env.DB.prepare(
    `SELECT client_name FROM oauth_clients WHERE client_id = ?`,
  )
    .bind(clientId)
    .first<{ client_name: string | null }>()
  // Mint with just `[<kind>]` — the renderer derives the bold display
  // name from the kind taxonomy, and the client_name suffix here was
  // pure noise (e.g. "[claude-code] Claude Code (huozi)" produced a
  // redundant "huozi" subtitle in the UI).
  const labelKind = inferAgentKind(client?.client_name ?? null)
  const apiKeyName = `[${labelKind}]`

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO api_keys
       (key_id, key_hash, workspace_id, scope_path, principal_type, principal_id,
        created_at, expires_at, ttl_seconds, name, oauth_client_id)
       VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newAccessKeyId,
      newAccessHash,
      row.workspace_id,
      null,
      row.user_id,
      now,
      newAccessExpiresAt,
      ACCESS_TOKEN_TTL_SECONDS,
      apiKeyName,
      clientId,
    ),
    env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
       (token_hash, client_id, user_id, workspace_id, scope,
        current_access_key_id, previous_token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newRefreshHash,
      clientId,
      row.user_id,
      row.workspace_id,
      row.scope,
      newAccessKeyId,
      refreshHash,
      now,
      newRefreshExpiresAt,
    ),
    env.DB.prepare(
      `UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE token_hash = ?`,
    ).bind(now, refreshHash),
    // Also revoke the old access_token (api_keys row) so the previous
    // Bearer header stops working immediately. This isn't strictly required
    // (it expires in ≤1 h) but matches user expectation when they "log out".
    env.DB.prepare(
      `UPDATE api_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL`,
    ).bind(now, row.current_access_key_id ?? ''),
  ])

  return Response.json(
    {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: row.scope ?? 'mcp',
    },
    {
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
      },
    },
  )
}

/** Walk the previous_token_hash chain and revoke every link. Used when a
 *  revoked refresh token is presented (token-leak detection). */
async function invalidateRefreshChain(
  env: HuoziCloudflareBindings,
  startHash: string,
): Promise<void> {
  const now = Date.now()
  // Forward (newer) chain: anything pointing AT startHash via previous.
  // Backward (older) chain: from startHash, follow previous_token_hash up.
  // Bound depth to avoid pathological loops.
  const seen = new Set<string>([startHash])
  let cursor = startHash
  for (let i = 0; i < 50; i++) {
    const row = await env.DB.prepare(
      `SELECT previous_token_hash FROM oauth_refresh_tokens WHERE token_hash = ?`,
    )
      .bind(cursor)
      .first<{ previous_token_hash: string | null }>()
    if (!row?.previous_token_hash || seen.has(row.previous_token_hash)) break
    seen.add(row.previous_token_hash)
    cursor = row.previous_token_hash
  }
  // Forward: descendants whose previous_token_hash points into our seen set.
  for (let i = 0; i < 50; i++) {
    const placeholders = Array.from(seen).map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT token_hash FROM oauth_refresh_tokens
       WHERE previous_token_hash IN (${placeholders})
         AND token_hash NOT IN (${placeholders})`,
    )
      .bind(...seen, ...seen)
      .all<{ token_hash: string }>()
    const newOnes = (rows.results ?? []).map((r) => r.token_hash).filter((h) => !seen.has(h))
    if (newOnes.length === 0) break
    for (const h of newOnes) seen.add(h)
  }
  if (seen.size === 0) return
  const placeholders = Array.from(seen).map(() => '?').join(',')
  await env.DB.prepare(
    `UPDATE oauth_refresh_tokens SET revoked_at = ?
     WHERE token_hash IN (${placeholders}) AND revoked_at IS NULL`,
  )
    .bind(now, ...seen)
    .run()
}

// ── Helpers ─────────────────────────────────────────────────────────────

function jsonError(error: string, description: string, status: number): Response {
  return Response.json(
    { error, error_description: description || undefined },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    },
  )
}

function htmlError(env: HuoziCloudflareBindings, status: number, message: string): Response {
  // Plain HTML (no Tailwind dependency in worker) for the rare case where
  // we MUST surface to the user, not redirect (per RFC 6749 §4.1.2.1).
  const safeMsg = message.replace(/[<>&]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
  )
  const support = `${publicBase(env)}/start`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>OAuth error</title>
<style>body{font:14px/1.5 -apple-system,sans-serif;max-width:640px;margin:64px auto;padding:0 16px;color:#333}
h1{font-size:20px;margin:0 0 8px}p{color:#666}code{background:#f5f5f5;padding:2px 6px;border-radius:4px}
a{color:#888;font-size:13px}</style></head>
<body><h1>OAuth authorization request rejected</h1>
<p>${safeMsg}</p>
<p>This usually means the MCP client wasn't registered correctly. Walk-through: <a href="${support}">${support}</a></p>
</body></html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

/** Map self-reported client_name onto our agent-kind taxonomy. Used to
 *  prefix api_keys.name (e.g. "[claude-code] Claude Code") so the existing
 *  UI shows the right icon. */
function inferAgentKind(clientName: string | null): string {
  if (!clientName) return 'other'
  const n = clientName.toLowerCase()
  if (n.includes('claude code') || n === 'claude-code') return 'claude-code'
  if (n.includes('claude')) return 'desktop'
  if (n.includes('cursor')) return 'cursor'
  if (n.includes('codex')) return 'codex'
  if (n.includes('hermes')) return 'hermes'
  if (n.includes('openclaw')) return 'openclaw'
  return 'other'
}
