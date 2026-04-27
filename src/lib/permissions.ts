/**
 * Workspace permission model — shared between Cloud and Edge editions.
 *
 * Two layers, designed to compose:
 *
 *   1. User layer    — workspace_members.role grants a set of capabilities
 *   2. Key layer     — api_keys.caps narrows that set (NULL = full inherit)
 *
 * Effective capabilities at runtime:
 *
 *      effective = (api_keys.caps ?? ROLE_CAPS[user.role])
 *                ∩ ROLE_CAPS[user.role]      // never escalate beyond role
 *
 * v1 ships with caps always NULL — every key inherits its creator's role
 * caps. The intersection is the v2 hook for "advanced" per-key narrowing
 * UI; it costs nothing to compute now and guarantees the invariant
 * "Agent ≤ User" can never be violated.
 *
 * The Worker has its own copy of this file at
 * `packages/huozi-cloud/src/storage/cloudflare/permissions.ts`. They are
 * hand-mirrored — kept tiny on purpose so a monorepo abstraction would
 * be overkill.
 */

export type Capability =
  // ── File operations ──────────────────────────────────────────────────
  /** huozi_read / glob / grep / history / list_tree / template */
  | "read"
  /** huozi_write / edit / batch_edit / mv / mkdir */
  | "write"
  /** huozi_rm — destructive. Can subset out of write later. */
  | "delete"
  /** huozi_share — creates a public URL outside the workspace. */
  | "share"
  // ── Key management (own keys are implicit; these gate cross-user) ────
  /** Mint a key for self. Implicit "manage own keys" includes list/TTL/revoke. */
  | "mint_key"
  /** See keys minted by other workspace members. */
  | "view_any_key"
  /** Revoke keys minted by other workspace members. */
  | "revoke_any_key"
  // ── Workspace administration ─────────────────────────────────────────
  /** Invite + remove members. */
  | "manage_members"
  /** Drop the workspace. */
  | "delete_workspace";

export const ALL_CAPS: ReadonlyArray<Capability> = [
  "read",
  "write",
  "delete",
  "share",
  "mint_key",
  "view_any_key",
  "revoke_any_key",
  "manage_members",
  "delete_workspace",
];

export type Role = "owner" | "member";

export const ROLE_CAPS: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    "read",
    "write",
    "delete",
    "share",
    "mint_key",
    "view_any_key",
    "revoke_any_key",
    "manage_members",
    "delete_workspace",
  ]),
  member: new Set<Capability>([
    "read",
    "write",
    "delete",
    "share",
    "mint_key",
  ]),
};

/**
 * MCP tool name → required capability. Tools the Worker dispatches via
 * /mcp tools/call use this map to gate execution.
 *
 * Tools missing from this map are treated as `read` (the safest default
 * — read tools the agent can already do trivially via tool reflection).
 */
export const TOOL_TO_CAP: Record<string, Capability> = {
  huozi_read: "read",
  huozi_glob: "read",
  huozi_grep: "read",
  huozi_history: "read",
  huozi_list_tree: "read",
  huozi_template: "read",

  huozi_write: "write",
  huozi_edit: "write",
  huozi_batch_edit: "write",
  huozi_mv: "write",
  huozi_mkdir: "write",

  huozi_rm: "delete",

  huozi_share: "share",
};

/**
 * Compute effective caps for a Bearer-token request.
 *
 *   - keyCaps   = serialized caps from api_keys.caps; null/undefined = inherit
 *   - role      = the principal's role in the workspace; null when unknown
 *                 (e.g. system / admin-bootstrap key) — falls back to all caps.
 */
export function effectiveCaps(opts: {
  keyCaps: Capability[] | null;
  role: Role | null;
}): Set<Capability> {
  const roleCaps = opts.role
    ? new Set(ROLE_CAPS[opts.role])
    : new Set(ALL_CAPS);
  if (!opts.keyCaps) return roleCaps;
  // Intersect — key caps can only narrow, never expand.
  const out = new Set<Capability>();
  for (const c of opts.keyCaps) if (roleCaps.has(c)) out.add(c);
  return out;
}

export function hasCap(
  effective: ReadonlySet<Capability>,
  needed: Capability,
): boolean {
  return effective.has(needed);
}

/**
 * Parse an api_keys.caps cell value (TEXT JSON array or NULL).
 * Returns null on invalid JSON so callers can treat "broken row" the
 * same as "inherit" — fail-open here is intentional, since corrupted
 * caps would otherwise lock keys out of all operations.
 */
export function parseKeyCaps(raw: string | null): Capability[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is Capability =>
      typeof x === "string" && (ALL_CAPS as readonly string[]).includes(x),
    );
  } catch {
    return null;
  }
}
