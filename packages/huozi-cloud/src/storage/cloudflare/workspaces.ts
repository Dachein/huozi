/**
 * Workspace admin endpoints — server-to-server CRUD on the D1 `workspaces`
 * table, callable only by trusted backends (huozi.app's Next.js server)
 * with `X-Admin-Secret`.
 *
 * Every workspace is owned by one user. The slug is unique across the whole
 * deployment (matches the public URL: huozi.app/<slug>/...). The `id` is a
 * UUID and may match the former Supabase cloud_workspaces.id for migrated
 * rows.
 *
 * Workspaces are intentionally minimal here — no member table, no role,
 * no plan / billing fields. Phase B will add `workspace_members` if /
 * when we ship invites.
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

export interface WorkspaceRow {
  id: string
  slug: string
  name: string
  owner_id: string
  created_at: number
}

function uuid(): string {
  return crypto.randomUUID()
}

// ── POST /admin/workspaces ───────────────────────────────────────────────

export interface CreateWorkspaceRequest {
  slug: string
  name: string
  owner_id: string
  /** Optional — caller may want to preserve a UUID across migrations. */
  id?: string
}

export async function handleCreateWorkspace(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: CreateWorkspaceRequest
  try {
    body = (await request.json()) as CreateWorkspaceRequest
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.slug || !body.name || !body.owner_id) {
    return Response.json(
      { error: 'missing_fields' },
      { status: 400 },
    )
  }
  if (!SLUG_RE.test(body.slug)) {
    return Response.json(
      {
        error: 'slug_format',
        message:
          'Slug must be 3–64 lowercase letters, digits, or hyphens; cannot start or end with a hyphen.',
      },
      { status: 400 },
    )
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM workspaces WHERE slug = ?`,
  )
    .bind(body.slug)
    .first<{ id: string }>()
  if (existing) {
    return Response.json({ error: 'slug_taken' }, { status: 409 })
  }

  const id = body.id ?? uuid()
  const now = Date.now()
  try {
    // Use D1 batch so the workspace + owner-member pair land atomically.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO workspaces (id, slug, name, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, body.slug, body.name, body.owner_id, now),
      env.DB.prepare(
        `INSERT INTO workspace_members
         (workspace_id, user_id, role, joined_at, invited_by)
         VALUES (?, ?, 'owner', ?, NULL)`,
      ).bind(id, body.owner_id, now),
    ])
  } catch (err) {
    return Response.json(
      {
        error: 'insert_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return Response.json({
    ok: true,
    workspace: {
      id,
      slug: body.slug,
      name: body.name,
      owner_id: body.owner_id,
      created_at: now,
    } satisfies WorkspaceRow,
  })
}

// ── GET /admin/workspaces?owner_id=… ─────────────────────────────────────
// Returns all workspaces owned by a given principal, ordered by creation.
// Use ?slug=<x> to fetch a single workspace by slug instead.

export async function handleListWorkspaces(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const ownerId = url.searchParams.get('owner_id')
  const memberId = url.searchParams.get('member_id')
  const slug = url.searchParams.get('slug')

  if (id) {
    const row = await env.DB.prepare(
      `SELECT id, slug, name, owner_id, created_at
       FROM workspaces WHERE id = ?`,
    )
      .bind(id)
      .first<WorkspaceRow>()
    return Response.json({ ok: true, workspaces: row ? [row] : [] })
  }

  if (slug) {
    const row = await env.DB.prepare(
      `SELECT id, slug, name, owner_id, created_at
       FROM workspaces WHERE slug = ?`,
    )
      .bind(slug)
      .first<WorkspaceRow>()
    return Response.json({ ok: true, workspaces: row ? [row] : [] })
  }

  // member_id wins over owner_id when both are passed — it's the more
  // useful query (the user wants every workspace they have access to,
  // not just ones they own).
  if (memberId) {
    const { results } = await env.DB.prepare(
      `SELECT w.id, w.slug, w.name, w.owner_id, w.created_at
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY m.joined_at ASC`,
    )
      .bind(memberId)
      .all<WorkspaceRow>()
    return Response.json({ ok: true, workspaces: results ?? [] })
  }

  if (!ownerId) {
    return Response.json(
      { error: 'missing_filter' },
      { status: 400 },
    )
  }

  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, owner_id, created_at
     FROM workspaces WHERE owner_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(ownerId)
    .all<WorkspaceRow>()

  return Response.json({ ok: true, workspaces: results ?? [] })
}

// ── GET /admin/workspaces/check-slug?slug=… ──────────────────────────────

export async function handleCheckSlug(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')
  if (!slug) {
    return Response.json({ error: 'missing_slug' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ ok: true, available: false, reason: 'format' })
  }
  const row = await env.DB.prepare(
    `SELECT id FROM workspaces WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ id: string }>()
  return Response.json({
    ok: true,
    available: !row,
    reason: row ? 'taken' : null,
  })
}

// ── DELETE /admin/workspaces?id=… ────────────────────────────────────────
// Used for onboarding rollback. Doesn't cascade — api_keys + files in this
// workspace remain (workspace_id is just a string label there).

export async function handleDeleteWorkspace(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'DELETE' && request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  let id = url.searchParams.get('id') ?? undefined
  if (!id && request.method === 'POST') {
    try {
      const body = (await request.json()) as { id?: string }
      id = body.id
    } catch {
      /* fall through */
    }
  }
  if (!id) {
    return Response.json({ error: 'missing_id' }, { status: 400 })
  }
  const result = await env.DB.prepare(
    `DELETE FROM workspaces WHERE id = ?`,
  )
    .bind(id)
    .run()
  return Response.json({
    ok: true,
    deleted: result.meta?.changes ?? 0,
  })
}
