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
  | { ok: true; principal: McpPrincipal }
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
    return { ok: true, principal: cached.principal }
  }

  // Cold path: D1 lookup.
  const row = await env.DB.prepare(
    `SELECT workspace_id, scope_path, principal_type, principal_id,
            expires_at, ttl_seconds
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

  return { ok: true, principal }
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
