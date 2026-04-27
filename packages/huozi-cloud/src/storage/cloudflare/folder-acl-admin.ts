/**
 * Folder ACL admin endpoints. Server-to-server only (X-Admin-Secret).
 * The Next.js side wraps these and applies user-level authorization
 * (caller must be in the ACL or have workspace write access for public
 * folders).
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'
import { normalizePrefix } from './folder-acl.js'

export interface FolderAclAdminEnv extends AdminEnv {}

interface FolderAclSummary {
  workspace_id: string
  path_prefix: string
  mode: 'private'
  members: string[] // user_ids
  last_changed_by: string
  last_changed_at: number
}

// ── GET /admin/folder-acls?workspace_id=… ────────────────────────────────
// List every private folder in a workspace + its members. Caller can
// further filter by `path_prefix` exact match.

export async function handleListFolderAcls(
  request: Request,
  env: FolderAclAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const wsId = url.searchParams.get('workspace_id')
  const prefix = url.searchParams.get('path_prefix')
  if (!wsId) {
    return Response.json({ error: 'missing_workspace_id' }, { status: 400 })
  }

  const aclQuery = prefix
    ? env.DB.prepare(
        `SELECT workspace_id, path_prefix, mode, last_changed_by, last_changed_at
         FROM folder_acls WHERE workspace_id = ? AND path_prefix = ?`,
      ).bind(wsId, prefix)
    : env.DB.prepare(
        `SELECT workspace_id, path_prefix, mode, last_changed_by, last_changed_at
         FROM folder_acls WHERE workspace_id = ?
         ORDER BY path_prefix ASC`,
      ).bind(wsId)

  const aclRows = await aclQuery.all<{
    workspace_id: string
    path_prefix: string
    mode: 'private'
    last_changed_by: string
    last_changed_at: number
  }>()

  if (!aclRows.results || aclRows.results.length === 0) {
    return Response.json({ ok: true, acls: [] })
  }

  // Hydrate members in one query.
  const placeholders = aclRows.results.map(() => '?').join(',')
  const memberRows = await env.DB.prepare(
    `SELECT path_prefix, user_id FROM folder_acl_members
     WHERE workspace_id = ? AND path_prefix IN (${placeholders})`,
  )
    .bind(wsId, ...aclRows.results.map((r) => r.path_prefix))
    .all<{ path_prefix: string; user_id: string }>()

  const byPrefix = new Map<string, string[]>()
  for (const m of memberRows.results ?? []) {
    const arr = byPrefix.get(m.path_prefix) ?? []
    arr.push(m.user_id)
    byPrefix.set(m.path_prefix, arr)
  }

  const acls: FolderAclSummary[] = aclRows.results.map((r) => ({
    workspace_id: r.workspace_id,
    path_prefix: r.path_prefix,
    mode: r.mode,
    members: byPrefix.get(r.path_prefix) ?? [],
    last_changed_by: r.last_changed_by,
    last_changed_at: r.last_changed_at,
  }))

  return Response.json({ ok: true, acls })
}

// ── POST /admin/folder-acls ──────────────────────────────────────────────
// Create or replace a folder's ACL. Body:
//   { workspace_id, path_prefix, mode='private', members[], changed_by }
// members is the FULL desired list — server replaces existing rows.

export interface SetFolderAclRequest {
  workspace_id: string
  path_prefix: string
  mode: 'private'
  members: string[]
  changed_by: string
}

export async function handleSetFolderAcl(
  request: Request,
  env: FolderAclAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: SetFolderAclRequest
  try {
    body = (await request.json()) as SetFolderAclRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (
    !body.workspace_id ||
    !body.path_prefix ||
    body.mode !== 'private' ||
    !body.changed_by ||
    !Array.isArray(body.members)
  ) {
    return Response.json({ error: 'missing_or_invalid_fields' }, { status: 400 })
  }
  if (body.members.length === 0) {
    return Response.json(
      { error: 'empty_members', message: 'private folder needs at least one member' },
      { status: 400 },
    )
  }

  let prefix: string
  try {
    prefix = normalizePrefix(body.path_prefix)
  } catch {
    return Response.json({ error: 'invalid_path_prefix' }, { status: 400 })
  }

  const now = Date.now()
  // D1 batch: upsert ACL row + replace members.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO folder_acls
       (workspace_id, path_prefix, mode, last_changed_by, last_changed_at)
       VALUES (?, ?, 'private', ?, ?)
       ON CONFLICT(workspace_id, path_prefix) DO UPDATE SET
         last_changed_by = excluded.last_changed_by,
         last_changed_at = excluded.last_changed_at`,
    ).bind(body.workspace_id, prefix, body.changed_by, now),
    env.DB.prepare(
      `DELETE FROM folder_acl_members
       WHERE workspace_id = ? AND path_prefix = ?`,
    ).bind(body.workspace_id, prefix),
    ...body.members.map((u) =>
      env.DB.prepare(
        `INSERT INTO folder_acl_members
         (workspace_id, path_prefix, user_id, added_by, added_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(body.workspace_id, prefix, u, body.changed_by, now),
    ),
  ])

  return Response.json({
    ok: true,
    workspace_id: body.workspace_id,
    path_prefix: prefix,
    mode: 'private',
    members: body.members,
    last_changed_by: body.changed_by,
    last_changed_at: now,
  })
}

// ── DELETE /admin/folder-acls?workspace_id=…&path_prefix=… ───────────────
// Make a folder public again (delete the ACL row + member rows).

export async function handleDeleteFolderAcl(
  request: Request,
  env: FolderAclAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'DELETE') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const wsId = url.searchParams.get('workspace_id')
  const prefix = url.searchParams.get('path_prefix')
  if (!wsId || !prefix) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }
  let normalized: string
  try {
    normalized = normalizePrefix(prefix)
  } catch {
    return Response.json({ error: 'invalid_path_prefix' }, { status: 400 })
  }
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM folder_acl_members
       WHERE workspace_id = ? AND path_prefix = ?`,
    ).bind(wsId, normalized),
    env.DB.prepare(
      `DELETE FROM folder_acls
       WHERE workspace_id = ? AND path_prefix = ?`,
    ).bind(wsId, normalized),
  ])
  return Response.json({ ok: true })
}

// ── GET /admin/folder-acls/for-user?workspace_id=…&user_id=… ─────────────
// List the path_prefixes a given user is a member of. Used by Next.js
// to render the "private folders I'm in" view for non-owner members.

export async function handleListFolderAclsForUser(
  request: Request,
  env: FolderAclAdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const wsId = url.searchParams.get('workspace_id')
  const userId = url.searchParams.get('user_id')
  if (!wsId || !userId) {
    return Response.json({ error: 'missing_fields' }, { status: 400 })
  }
  const { results } = await env.DB.prepare(
    `SELECT path_prefix FROM folder_acl_members
     WHERE workspace_id = ? AND user_id = ?
     ORDER BY path_prefix ASC`,
  )
    .bind(wsId, userId)
    .all<{ path_prefix: string }>()
  return Response.json({
    ok: true,
    path_prefixes: (results ?? []).map((r) => r.path_prefix),
  })
}
