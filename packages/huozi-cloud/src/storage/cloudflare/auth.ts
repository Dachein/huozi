/**
 * Bearer-token → principal resolution against D1 `api_keys`.
 *
 * We only expose the resolution step; token minting (CLI-side) is handled
 * elsewhere. Tokens follow the format `hz_<random>`; we hash with SHA-256
 * and compare against `api_keys.key_hash`.
 *
 * Per-isolate in-memory cache reduces the auth D1 query overhead from
 * ~100-300ms to ~0 on warm paths. Cache is scoped to the CF Worker isolate
 * (not persisted across isolates) which is fine — cold isolates hit D1 once,
 * then serve warm for the next ~5 minutes.
 */

import type { McpPrincipal } from '../../mcp/server.js'
import type { HuoziCloudflareBindings } from './bindings.js'
import { sha256Hex } from './sha.js'

export interface AuthFailure {
  status: 401 | 403
  message: string
}

export type AuthResult =
  | {
      ok: true
      principal: McpPrincipal
      /** SHA-256(token) — exposed so the worker can write per-key metadata
       *  (e.g. last_action_tool / last_action_target) without re-hashing. */
      keyHash: string
    }
  | { ok: false; failure: AuthFailure }

interface CacheEntry {
  principal: McpPrincipal
  /** Token's `expires_at` from DB (may be null — use Infinity for never). */
  expiresAt: number
  /**
   * Sliding-window length in seconds. `null` = key never expires and we
   * skip the expires_at bump entirely.
   */
  ttlSeconds: number | null
  /** Our cache TTL — when to force a re-check against D1. */
  refreshAfter: number
}

/** 5 min cache TTL. Key revocation lag is bounded by this. */
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000
/** Cap on how many hashes we keep hot. Far more than a small deploy needs. */
const AUTH_CACHE_MAX = 500

const authCache = new Map<string, CacheEntry>()

/**
 * Given the raw `Authorization` header, resolve a principal or return an
 * error response hint.
 */
export async function resolveBearer(
  authHeader: string | null,
  env: HuoziCloudflareBindings,
): Promise<AuthResult> {
  if (!authHeader) {
    return {
      ok: false,
      failure: { status: 401, message: 'missing Authorization header' },
    }
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return {
      ok: false,
      failure: { status: 401, message: 'expected Authorization: Bearer <token>' },
    }
  }
  const token = match[1]!
  const keyHash = await sha256Hex(token)
  const now = Date.now()

  // Warm-path: isolate-memory cache.
  const cached = authCache.get(keyHash)
  if (cached && cached.refreshAfter > now) {
    // Token-expiry still honored per-request (no cache bypass bug).
    if (cached.expiresAt < now) {
      authCache.delete(keyHash)
      return { ok: false, failure: { status: 401, message: 'token expired' } }
    }
    // Best-effort last_used_at + sliding-window expires_at touch.
    // If ttl_seconds is null (never-expires keys), we leave expires_at alone.
    // Otherwise we push the deadline forward — that's the whole point of
    // the sliding-window model.
    void bumpActivity(env, keyHash, cached.ttlSeconds, now)
    return { ok: true, principal: cached.principal, keyHash }
  }

  // Cold path: D1 lookup.
  const row = await env.DB.prepare(
    `SELECT workspace_id, scope_path, principal_type, principal_id,
            expires_at, ttl_seconds, key_id, last_used_at, name
     FROM api_keys WHERE key_hash = ?`,
  )
    .bind(keyHash)
    .first<{
      workspace_id: string
      scope_path: string | null
      principal_type: string
      principal_id: string
      expires_at: number | null
      ttl_seconds: number | null
      key_id: string
      last_used_at: number | null
      name: string | null
    }>()

  if (!row) {
    return {
      ok: false,
      failure: { status: 401, message: 'unknown token' },
    }
  }
  if (row.expires_at !== null && row.expires_at < now) {
    return {
      ok: false,
      failure: { status: 401, message: 'token expired' },
    }
  }

  const principalType =
    row.principal_type === 'user'
      ? ('user' as const)
      : row.principal_type === 'system'
        ? ('system' as const)
        : ('agent' as const)

  const principal: McpPrincipal = {
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    principalType,
    scopePath: row.scope_path,
  }

  // Bounded cache — evict oldest entry when full (simple FIFO, good enough).
  if (authCache.size >= AUTH_CACHE_MAX) {
    const firstKey = authCache.keys().next().value
    if (firstKey !== undefined) authCache.delete(firstKey)
  }
  authCache.set(keyHash, {
    principal,
    expiresAt: row.expires_at ?? Infinity,
    ttlSeconds: row.ttl_seconds,
    refreshAfter: now + AUTH_CACHE_TTL_MS,
  })

  // Best-effort sliding-window bump.
  void bumpActivity(env, keyHash, row.ttl_seconds, now)

  // If this key has never been used before, broadcast a connection event
  // so any /workspace browser session gets a real-time "new agent online"
  // signal. We only detect this on the cold path (cache miss), which is
  // fine because first-use is ALWAYS a cold path — the cache can't hold
  // an entry we've never authenticated.
  if (row.last_used_at === null) {
    void notifyConnectionUsed(env, {
      type: 'connection',
      action: 'first_used',
      workspace_id: row.workspace_id,
      key_id: row.key_id,
      principal_id: row.principal_id,
      principal_type: principalType,
      name: row.name,
      timestamp: now,
    })
  }

  return { ok: true, principal, keyHash }
}

/**
 * Record "what did this key just do?" on the api_keys row. Called by the
 * worker after a successful tools/call dispatch so the Web UI can render
 * a friendly "last action" line beside each connection. Fire-and-forget;
 * failures are swallowed because this is metadata, not correctness.
 */
export async function touchAction(
  env: HuoziCloudflareBindings,
  keyHash: string,
  tool: string,
  target: string | null,
): Promise<void> {
  try {
    // Cap target length — some patterns / file paths can be long, and we
    // only surface this as a UI hint anyway.
    const safeTarget = target ? target.slice(0, 160) : null
    await env.DB.prepare(
      'UPDATE api_keys SET last_action_tool = ?, last_action_target = ? WHERE key_hash = ?',
    )
      .bind(tool, safeTarget, keyHash)
      .run()
  } catch {
    /* best-effort */
  }
}

interface ConnectionEvent {
  type: 'connection'
  action: 'first_used'
  workspace_id: string
  key_id: string
  principal_id: string
  principal_type: 'user' | 'agent' | 'system'
  name: string | null
  timestamp: number
}

/**
 * Fire-and-forget: push a connection event through the workspace's DO so
 * any active WebSocket (browser /workspace page) picks it up. We never
 * block the auth path on this — if the DO is cold or the fetch fails we
 * silently drop the event.
 */
async function notifyConnectionUsed(
  env: HuoziCloudflareBindings,
  event: ConnectionEvent,
): Promise<void> {
  try {
    const stub = env.WORKSPACE_DO.get(
      env.WORKSPACE_DO.idFromName(event.workspace_id),
    )
    await stub.fetch(
      new Request('http://do.internal/events/connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }),
    )
  } catch {
    // Best-effort by design.
  }
}

/**
 * Touch `last_used_at` (always) and slide `expires_at` forward (only for
 * keys with a non-null ttl). Fire-and-forget — we never block the request
 * path on this write.
 *
 * Atomic at the row level so a concurrent revoke can't race and reinstate
 * the key.
 */
async function bumpActivity(
  env: HuoziCloudflareBindings,
  keyHash: string,
  ttlSeconds: number | null,
  now: number,
): Promise<void> {
  try {
    if (ttlSeconds === null) {
      await env.DB.prepare(
        'UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?',
      )
        .bind(now, keyHash)
        .run()
    } else {
      const expiresAt = now + ttlSeconds * 1000
      await env.DB.prepare(
        'UPDATE api_keys SET last_used_at = ?, expires_at = ? WHERE key_hash = ?',
      )
        .bind(now, expiresAt, keyHash)
        .run()
    }
  } catch {
    // Swallow — best-effort by design.
  }
}

/**
 * Test-only: flush the auth cache. Useful in bench runs that want to measure
 * cold-cache latency.
 */
export function _clearAuthCache(): void {
  authCache.clear()
}
