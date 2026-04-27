/**
 * D1-backed lookup powering `huozi_whoami`.
 *
 * Joins users + workspaces + workspace_members + api_keys in 1 round-trip
 * each. Tolerates orphan rows (user_id present on the key but missing from
 * users; workspace slug missing) and returns nullable fields rather than
 * throwing — the whole point of the tool is to surface those mismatches.
 */

import type { McpPrincipal } from '../../mcp/server.js'
import type { WhoamiOutput } from '../../tools/WhoamiTool.js'
import type { HuoziCloudflareBindings } from './bindings.js'

interface UserRow {
  id: string
  email: string | null
  display_name: string | null
}

interface WorkspaceRow {
  id: string
  slug: string
  name: string
}

interface MemberRow {
  role: string
  joined_at: number
}

interface KeyRow {
  key_id: string
  name: string | null
  scope_path: string | null
  created_at: number
  last_used_at: number | null
}

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}

export async function fetchWhoami(
  env: HuoziCloudflareBindings,
  principal: McpPrincipal,
  keyHash: string,
): Promise<WhoamiOutput | { error: string }> {
  const wsSlug = principal.workspaceId.replace(/^ws_/, '')

  const [userRow, wsRow, keyRow] = await Promise.all([
    env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?')
      .bind(principal.principalId)
      .first<UserRow>(),
    env.DB.prepare('SELECT id, slug, name FROM workspaces WHERE slug = ?')
      .bind(wsSlug)
      .first<WorkspaceRow>(),
    env.DB.prepare(
      'SELECT key_id, name, scope_path, created_at, last_used_at FROM api_keys WHERE key_hash = ?',
    )
      .bind(keyHash)
      .first<KeyRow>(),
  ])

  if (!keyRow) {
    return { error: 'api_key row vanished mid-request' }
  }

  let memberRow: MemberRow | null = null
  if (wsRow) {
    memberRow = await env.DB.prepare(
      'SELECT role, joined_at FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    )
      .bind(wsRow.id, principal.principalId)
      .first<MemberRow>()
  }

  const role: 'owner' | 'member' | null =
    memberRow?.role === 'owner' || memberRow?.role === 'member'
      ? memberRow.role
      : null

  return {
    user: {
      user_id: principal.principalId,
      email: userRow?.email ?? null,
      display_name: userRow?.display_name ?? null,
    },
    workspace: {
      workspace_id: wsRow?.id ?? principal.workspaceId,
      slug: wsRow?.slug ?? null,
      name: wsRow?.name ?? null,
      role,
      member_since: isoOrNull(memberRow?.joined_at ?? null),
    },
    api_key: {
      key_id: keyRow.key_id,
      name: keyRow.name,
      principal_type: principal.principalType,
      scope: keyRow.scope_path,
      created_at: new Date(keyRow.created_at).toISOString(),
      last_used_at: isoOrNull(keyRow.last_used_at),
    },
  }
}
