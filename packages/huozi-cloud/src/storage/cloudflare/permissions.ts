/**
 * Worker-side mirror of the workspace permission model.
 *
 * MUST stay in sync with the Next.js copy at `src/lib/permissions.ts`.
 * Both files are tiny on purpose — adding a shared package for 80 lines
 * would be overkill, and the Worker / Next.js editions might evolve
 * different cap sets if Edge ever ships features Cloud doesn't.
 */

export type Capability =
  | 'read'
  | 'write'
  | 'delete'
  | 'share'
  | 'mint_key'
  | 'view_any_key'
  | 'revoke_any_key'
  | 'manage_members'
  | 'delete_workspace'

export const ALL_CAPS: ReadonlyArray<Capability> = [
  'read',
  'write',
  'delete',
  'share',
  'mint_key',
  'view_any_key',
  'revoke_any_key',
  'manage_members',
  'delete_workspace',
]

export type Role = 'owner' | 'member'

export const ROLE_CAPS: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    'read',
    'write',
    'delete',
    'share',
    'mint_key',
    'view_any_key',
    'revoke_any_key',
    'manage_members',
    'delete_workspace',
  ]),
  member: new Set<Capability>([
    'read',
    'write',
    'delete',
    'share',
    'mint_key',
  ]),
}

export const TOOL_TO_CAP: Record<string, Capability> = {
  huozi_read: 'read',
  huozi_glob: 'read',
  huozi_grep: 'read',
  huozi_history: 'read',
  huozi_list_tree: 'read',
  huozi_template: 'read',

  huozi_write: 'write',
  huozi_edit: 'write',
  huozi_batch_edit: 'write',
  huozi_mv: 'write',
  huozi_mkdir: 'write',

  huozi_rm: 'delete',

  huozi_share: 'share',
}

export function effectiveCaps(opts: {
  keyCaps: Capability[] | null
  role: Role | null
}): Set<Capability> {
  const roleCaps = opts.role
    ? new Set(ROLE_CAPS[opts.role])
    : new Set(ALL_CAPS)
  if (!opts.keyCaps) return roleCaps
  const out = new Set<Capability>()
  for (const c of opts.keyCaps) if (roleCaps.has(c)) out.add(c)
  return out
}

export function hasCap(
  effective: ReadonlySet<Capability>,
  needed: Capability,
): boolean {
  return effective.has(needed)
}

export function parseKeyCaps(raw: string | null): Capability[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x): x is Capability =>
      typeof x === 'string' && (ALL_CAPS as readonly string[]).includes(x),
    )
  } catch {
    return null
  }
}
