/**
 * Tiny module-scope in-memory cache with TTL.
 *
 * Why not Next.js `unstable_cache`: open-next config sets
 * `incrementalCache: "dummy"`, so unstable_cache silently no-ops on this
 * deploy. Why not Cache API: we want shared cache across user sessions
 * keyed by user / workspace, which Cache API can do but adds binding +
 * serialization complexity. A bare Map gives us 90% of the win.
 *
 * Cloudflare Workers reuse the same isolate to serve many sequential
 * requests in the same colocation, so this Map persists across requests
 * for as long as the isolate is hot — empirically several minutes of
 * sustained traffic. Cache misses degrade gracefully back to the loader.
 *
 * Safety invariants:
 *   - Caller MUST include user / workspace identity in the cache key for
 *     any per-user data. The cache is process-global; mixing keys leaks
 *     across users.
 *   - Loaders should be pure reads. Don't cache mutation results.
 *   - TTLs are best-effort — entries may live longer if the isolate is
 *     warm and nothing evicts them. Don't cache anything where stale
 *     reads are unsafe (auth checks, ACL decisions at request time).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  /** In-flight promise for the SAME key — coalesces concurrent loaders. */
  pending?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

export async function memoize<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  // Stale or missing. Coalesce concurrent loaders sharing this key so we
  // don't fire N parallel cloud fetches when N requests arrive together.
  if (hit?.pending) return hit.pending;
  const pending = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      // On error, drop the entry so the next caller retries instead of
      // serving a stuck pending promise.
      store.delete(key);
      throw err;
    });
  store.set(key, {
    value: (hit?.value ?? undefined) as T,
    expiresAt: hit?.expiresAt ?? 0,
    pending,
  });
  return pending;
}

/** Invalidate one or more cache keys. Mutation routes call this so the
 *  next read sees fresh data instead of waiting for TTL. */
export function invalidate(...keys: string[]): void {
  for (const k of keys) store.delete(k);
}

/** Invalidate every key whose name starts with `prefix`. Useful when a
 *  mutation affects multiple cached views for the same scope (e.g.
 *  invalidate `glob:<userKey>` and `recent:<userKey>` together). */
export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
