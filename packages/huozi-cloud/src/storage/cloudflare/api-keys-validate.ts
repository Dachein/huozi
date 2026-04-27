/**
 * Shared validators for `api_keys` row inserts and workspace-slug renames.
 *
 * These checks are not enforced by D1 schema (no FKs in D1), so the
 * application has to police referential integrity itself. We've already been
 * burned once by a key with a `principal_id` that didn't exist in `users`
 * and a `workspace_id` that referred to a since-renamed slug — that key
 * authenticated fine but every tools/call returned 403 because the
 * membership JOIN found nothing. Both mint paths now block at the door.
 */

import type { HuoziCloudflareBindings } from './bindings.js'

export interface PrincipalRefs {
  principalType: 'user' | 'agent' | 'system'
  principalId: string
  /** Stored on api_keys as `ws_<slug>` for legacy R2-prefix compatibility. */
  workspaceId: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; field: 'principal_id' | 'workspace_id' }

/**
 * Confirm the given `principal_id` and `workspace_id` actually point at live
 * rows in `users` / `workspaces` before we mint a key against them. System
 * principals skip the user check since admin tokens have no user row.
 */
export async function validatePrincipalAndWorkspace(
  env: HuoziCloudflareBindings,
  refs: PrincipalRefs,
): Promise<ValidationResult> {
  const wsSlug = refs.workspaceId.replace(/^ws_/, '')
  const wsRow = await env.DB.prepare(
    'SELECT id FROM workspaces WHERE slug = ?',
  )
    .bind(wsSlug)
    .first<{ id: string }>()
  if (!wsRow) {
    return {
      ok: false,
      error: `workspace_id ${refs.workspaceId} does not match any row in workspaces (slug ${wsSlug})`,
      field: 'workspace_id',
    }
  }

  if (refs.principalType !== 'system') {
    const userRow = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
      .bind(refs.principalId)
      .first<{ id: string }>()
    if (!userRow) {
      return {
        ok: false,
        error: `principal_id ${refs.principalId} does not exist in users table`,
        field: 'principal_id',
      }
    }
  }

  return { ok: true }
}

/**
 * Cascade a workspace slug rename across every D1 row that pins the old slug
 * via the `ws_<slug>` prefix convention. Run inside the same logical
 * transaction as the `UPDATE workspaces SET slug = ?` so a partial rename
 * can't leave dangling api_keys/api_tickets.
 *
 * NOTE: there is no rename endpoint today. This helper exists so any future
 * rename code path is forced to call exactly one helper instead of remembering
 * a list of tables. Keep this updated whenever a new D1 table starts storing
 * `ws_<slug>` strings.
 *
 * Tables that DO NOT need a rename here (use UUIDs already):
 *   - workspace_members  (workspace_id = workspaces.id UUID)
 *   - folder_acls        (workspace_id UUID)
 *   - folder_acl_members (workspace_id UUID)
 *   - shares             (workspace_id UUID)
 *
 * Tables that DO use `ws_<slug>` and need rewriting:
 *   - api_keys
 *   - api_tickets
 *   - WorkspaceDO storage (tip:${workspaceId}) — handled separately by the
 *     DO; not visible from the outer query layer.
 */
export async function cascadeWorkspaceSlugRename(
  env: HuoziCloudflareBindings,
  oldSlug: string,
  newSlug: string,
): Promise<{ keysUpdated: number; ticketsUpdated: number }> {
  const oldWs = `ws_${oldSlug}`
  const newWs = `ws_${newSlug}`

  const results = await env.DB.batch([
    env.DB.prepare('UPDATE api_keys SET workspace_id = ? WHERE workspace_id = ?')
      .bind(newWs, oldWs),
    env.DB.prepare('UPDATE api_tickets SET workspace_id = ? WHERE workspace_id = ?')
      .bind(newWs, oldWs),
  ])

  return {
    keysUpdated: (results[0]?.meta?.changes as number | undefined) ?? 0,
    ticketsUpdated: (results[1]?.meta?.changes as number | undefined) ?? 0,
  }
}
