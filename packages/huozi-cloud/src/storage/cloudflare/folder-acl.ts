/**
 * Folder-level access control list.
 *
 * Model:
 *   - Default: public. Absence of a `folder_acls` row for a path's nearest
 *     ancestor means anyone with workspace role caps can access.
 *   - Private: when a row exists for the nearest ancestor with mode='private',
 *     only user_ids in `folder_acl_members` for that prefix may access.
 *   - Workspace owner has NO bypass at the data layer (per the design's
 *     "owner is space admin, not data lord" principle). Owner's only
 *     escape hatch on inaccessible private folders is delete-folder, which
 *     destroys data without revealing it.
 *   - Egalitarian ACL ownership: every user_id in folder_acl_members can
 *     edit the ACL itself (add/remove members, flip private→public).
 *
 * Path normalization:
 *   - All paths are workspace-absolute (no leading slash, with internal /).
 *   - path_prefix in DB always ends with "/" (e.g. "funds/fund-A/").
 *   - "" (empty string) is the root prefix; treated as a valid ancestor of
 *     every path. v1 doesn't support workspace-root ACLs (would gate every
 *     read), so we reject path_prefix === "" at write time.
 */

import type { HuoziCloudflareBindings } from './bindings.js'

export interface FolderAcl {
  workspaceId: string
  pathPrefix: string
  mode: 'private'
  members: Set<string>
  lastChangedBy: string
  lastChangedAt: number
}

/** Normalize a path-prefix candidate. Throws on invalid input. */
export function normalizePrefix(input: string): string {
  // Strip a leading "/" to keep it workspace-absolute.
  let p = input.replace(/^\/+/, '')
  // Collapse double slashes.
  p = p.replace(/\/{2,}/g, '/')
  // Reject ".." traversal — same rule as scope.ts.
  if (p.split('/').includes('..')) {
    throw new Error('invalid_path_prefix')
  }
  // Must end with "/". Empty after trim → reject (no root ACL in v1).
  if (!p) throw new Error('empty_path_prefix')
  if (!p.endsWith('/')) p = p + '/'
  return p
}

/**
 * Walk a path's ancestors from longest to shortest, returning each candidate
 * prefix. For "/funds/fund-A/q1.md" returns:
 *   ["funds/fund-A/", "funds/"]
 * Always excludes the root ("") since we don't support root-level ACLs.
 */
export function ancestorPrefixes(path: string): string[] {
  const p = path.replace(/^\/+/, '')
  if (!p) return []
  const segments = p.split('/').filter(Boolean)
  // Drop the last segment (it's the file/leaf, not a folder).
  segments.pop()
  const out: string[] = []
  while (segments.length > 0) {
    out.push(segments.join('/') + '/')
    segments.pop()
  }
  return out
}

/**
 * Find the nearest applicable ACL for a path, or null if the path is in a
 * publicly-accessible region.
 *
 * Caches per-request to avoid repeated D1 queries when multiple paths in
 * the same call (batch_edit, glob filter) share ancestors.
 */
export class AclCache {
  private cache = new Map<string, FolderAcl | null>() // key: "ws:prefix"

  async nearest(
    env: HuoziCloudflareBindings,
    workspaceId: string,
    path: string,
  ): Promise<FolderAcl | null> {
    const candidates = ancestorPrefixes(path)
    if (candidates.length === 0) return null
    // Try cache first — if any cached hit is private, that's the nearest
    // we know of *for the candidates we've seen*.
    for (const prefix of candidates) {
      const cached = this.cache.get(`${workspaceId}:${prefix}`)
      if (cached !== undefined) {
        if (cached) return cached
        // cached null = explicitly known public → keep walking up.
      }
    }
    // Cold path: query DB for any of these prefixes; pick longest.
    // api_keys.workspace_id is `ws_<slug>` while folder_acls.workspace_id
    // is the workspaces.id UUID. JOIN via slug to bridge.
    const wsSlug = workspaceId.replace(/^ws_/, '')
    const placeholders = candidates.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT a.path_prefix, a.mode, a.last_changed_by, a.last_changed_at
       FROM folder_acls a
       JOIN workspaces w ON w.id = a.workspace_id
       WHERE w.slug = ? AND a.path_prefix IN (${placeholders})`,
    )
      .bind(wsSlug, ...candidates)
      .all<{
        path_prefix: string
        mode: string
        last_changed_by: string
        last_changed_at: number
      }>()

    const found = (rows.results ?? []).sort(
      (a, b) => b.path_prefix.length - a.path_prefix.length,
    )[0]
    if (!found) {
      // Cache misses across all candidates as public.
      for (const prefix of candidates) {
        this.cache.set(`${workspaceId}:${prefix}`, null)
      }
      return null
    }

    // Hydrate members. Same workspace_id format mismatch — bridge via slug.
    const memberRows = await env.DB.prepare(
      `SELECT m.user_id
       FROM folder_acl_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE w.slug = ? AND m.path_prefix = ?`,
    )
      .bind(wsSlug, found.path_prefix)
      .all<{ user_id: string }>()
    const members = new Set(
      (memberRows.results ?? []).map((r) => r.user_id),
    )

    const acl: FolderAcl = {
      workspaceId,
      pathPrefix: found.path_prefix,
      mode: 'private',
      members,
      lastChangedBy: found.last_changed_by,
      lastChangedAt: found.last_changed_at,
    }
    this.cache.set(`${workspaceId}:${found.path_prefix}`, acl)
    return acl
  }
}

export interface AccessCheckResult {
  allow: boolean
  reason?: 'acl_denied'
  /** The applicable ACL, when one exists. Null = public path. */
  acl?: FolderAcl | null
}

/**
 * Synchronous check given an already-resolved nearest ACL.
 */
export function evaluateAccess(
  acl: FolderAcl | null,
  userId: string,
): AccessCheckResult {
  if (!acl) return { allow: true, acl: null }
  if (acl.members.has(userId)) return { allow: true, acl }
  return { allow: false, reason: 'acl_denied', acl }
}

/**
 * Single-shot helper: resolve nearest ACL + evaluate. Use AclCache directly
 * when checking many paths in the same request (it caches across calls).
 */
export async function canAccess(
  env: HuoziCloudflareBindings,
  workspaceId: string,
  path: string,
  userId: string,
  cache?: AclCache,
): Promise<AccessCheckResult> {
  const c = cache ?? new AclCache()
  const acl = await c.nearest(env, workspaceId, path)
  return evaluateAccess(acl, userId)
}

/**
 * Filter a list of paths down to the ones the user is allowed to see.
 * Used as the OUTPUT pass for tools like glob / grep / list_tree / history.
 *
 * Note: this hides the *existence* of forbidden paths (per the "nested
 * traversal blocking" decision — Bob shouldn't see that "/private/secret.md"
 * exists if he can't open it).
 */
export async function filterPathsByAcl(
  env: HuoziCloudflareBindings,
  workspaceId: string,
  paths: string[],
  userId: string,
  cache?: AclCache,
): Promise<string[]> {
  const c = cache ?? new AclCache()
  const out: string[] = []
  for (const p of paths) {
    const r = await canAccess(env, workspaceId, p, userId, c)
    if (r.allow) out.push(p)
  }
  return out
}

/**
 * Extract every workspace-absolute path that a tool call wants to operate
 * on. Used as the INPUT pass: every returned path must pass canAccess
 * before the tool dispatches.
 *
 * Path-bearing fields by tool:
 *   - read / edit / write / rm / mkdir / share / history  →  file_path
 *   - glob / grep                                          →  path  (already
 *                                                              injected by
 *                                                              applyScopeToArgs
 *                                                              for scoped keys)
 *   - mv                                                   →  from + to
 *   - batch_edit                                           →  edits[].file_path
 *   - list_tree                                            →  path or "" (root)
 *
 * Tools with no path arg return an empty array (e.g. huozi_template).
 */
export function extractInputPaths(
  toolName: string,
  args: Record<string, unknown>,
): string[] {
  const out: string[] = []
  if (typeof args.file_path === 'string' && args.file_path) {
    out.push(args.file_path)
  }
  if (typeof args.path === 'string' && args.path) {
    out.push(args.path)
  }
  // mv: from + to
  if (typeof args.from === 'string' && args.from) out.push(args.from)
  if (typeof args.to === 'string' && args.to) out.push(args.to)
  // batch_edit
  if (Array.isArray(args.edits)) {
    for (const e of args.edits as unknown[]) {
      if (
        e &&
        typeof e === 'object' &&
        'file_path' in e &&
        typeof (e as Record<string, unknown>).file_path === 'string'
      ) {
        out.push((e as Record<string, unknown>).file_path as string)
      }
    }
  }
  void toolName
  return out
}
