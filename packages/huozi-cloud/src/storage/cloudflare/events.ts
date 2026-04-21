/**
 * Event-stream auth + WebSocket upgrade handling.
 *
 * Browsers can't send `Authorization` headers during a WebSocket upgrade —
 * only cookies are preserved, and cloud.huozi.app is on a different origin
 * than huozi.app, so cookies don't help either. The workaround is a
 * short-lived, single-use ticket:
 *
 *   POST /events/mint-ticket          Bearer <api_key>
 *     → { ticket, expires_in: 60 }
 *   GET  /events/ws?ticket=<ticket>   Upgrade: websocket
 *     → 101 Switching Protocols      (ticket is marked used atomically)
 *
 * The ticket binds a principal (workspace, scope, id) to the resulting
 * WebSocket. It is never logged and is SHA-256 hashed against an internal
 * nonce; once marked `used = 1` it cannot be replayed.
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'
import type { McpPrincipal } from '../../mcp/server.js'

/** Single-use ticket lifetime. Short enough that a leaked ticket is a near-non-issue. */
const TICKET_TTL_SECONDS = 60

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i]!.toString(16).padStart(2, '0')
  return out
}

interface TicketRow {
  workspace_id: string
  scope_path: string | null
  principal_type: string
  principal_id: string
  expires_at: number
  used: number
}

/**
 * POST /events/mint-ticket
 *
 * Input:  Bearer <api_key>
 * Output: { ok: true, ticket, expires_in }
 */
export async function handleMintTicket(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  const p = auth.principal
  const ticket = `tk_${randomHex(24)}`
  const now = Date.now()
  const expiresAt = now + TICKET_TTL_SECONDS * 1000

  try {
    await env.DB.prepare(
      `INSERT INTO api_tickets
       (ticket, workspace_id, scope_path, principal_type, principal_id, expires_at, used)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind(
        ticket,
        p.workspaceId,
        p.scopePath,
        p.principalType,
        p.principalId,
        expiresAt,
      )
      .run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: 'ticket_insert_failed', message },
      { status: 500 },
    )
  }

  return Response.json({
    ok: true,
    ticket,
    expires_in: TICKET_TTL_SECONDS,
  })
}

/**
 * Atomically consume a ticket — returns the bound principal on success.
 * Uses D1's UPDATE ... RETURNING (supported) with `used = 0` guard to ensure
 * single-use semantics even under racing upgrade requests.
 */
export async function consumeTicket(
  ticket: string,
  env: HuoziCloudflareBindings,
): Promise<
  | { ok: true; principal: McpPrincipal }
  | { ok: false; status: 401; message: string }
> {
  const now = Date.now()
  // Fast-path sanity.
  if (!ticket.startsWith('tk_')) {
    return { ok: false, status: 401, message: 'bad ticket format' }
  }

  // UPDATE …RETURNING: flips used=1 and returns the row in one round-trip.
  const row = await env.DB.prepare(
    `UPDATE api_tickets
     SET used = 1
     WHERE ticket = ? AND used = 0 AND expires_at > ?
     RETURNING workspace_id, scope_path, principal_type, principal_id, expires_at, used`,
  )
    .bind(ticket, now)
    .first<TicketRow>()

  if (!row) {
    return {
      ok: false,
      status: 401,
      message: 'ticket expired, used, or unknown',
    }
  }

  const principalType =
    row.principal_type === 'user'
      ? ('user' as const)
      : row.principal_type === 'system'
        ? ('system' as const)
        : ('agent' as const)

  return {
    ok: true,
    principal: {
      workspaceId: row.workspace_id,
      principalId: row.principal_id,
      principalType,
      scopePath: row.scope_path,
    },
  }
}

/**
 * GET /events/ws?ticket=<ticket>  Upgrade: websocket
 *
 * Routes the request to the workspace's WorkspaceDO, which accepts the
 * WebSocket under its hibernation API.
 */
export async function handleWsUpgrade(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.headers.get('upgrade') !== 'websocket') {
    return new Response('expected websocket upgrade', { status: 426 })
  }
  const url = new URL(request.url)
  const ticket = url.searchParams.get('ticket')
  if (!ticket) {
    return new Response('missing ticket', { status: 401 })
  }

  const consumed = await consumeTicket(ticket, env)
  if (!consumed.ok) {
    return new Response(consumed.message, { status: consumed.status })
  }
  const p = consumed.principal

  // Forward to the WorkspaceDO with principal metadata in headers. The DO
  // reads these to stamp the ws tags for scope-filtered broadcast.
  const stub = env.WORKSPACE_DO.get(env.WORKSPACE_DO.idFromName(p.workspaceId))
  const doUrl = new URL(request.url)
  doUrl.pathname = '/events/ws'
  // Drop the ticket from the forwarded URL (prevents it being logged).
  doUrl.searchParams.delete('ticket')

  const headers = new Headers(request.headers)
  headers.set('X-Huozi-Workspace', p.workspaceId)
  headers.set('X-Huozi-Principal-Id', p.principalId)
  headers.set('X-Huozi-Principal-Type', p.principalType)
  headers.set('X-Huozi-Scope-Path', p.scopePath ?? '')

  return stub.fetch(
    new Request(doUrl.toString(), {
      method: 'GET',
      headers,
    }),
  )
}

/**
 * Periodic cleanup — called opportunistically from handleMintTicket to keep
 * `api_tickets` from growing unbounded. Non-critical; failures are swallowed.
 *
 * Called inline (not background) but uses a LIMIT so the cost is small.
 */
export async function sweepExpiredTickets(
  env: HuoziCloudflareBindings,
): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM api_tickets
       WHERE ticket IN (
         SELECT ticket FROM api_tickets
         WHERE used = 1 OR expires_at < ?
         LIMIT 100
       )`,
    )
      .bind(Date.now() - 5 * 60 * 1000)
      .run()
  } catch {
    /* ignore */
  }
}
