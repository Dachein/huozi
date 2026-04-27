/**
 * Shared connection-management surface — backed by huozi-cloud's D1
 * `api_keys` table for both Cloud and Edge editions.
 *
 * Connection metadata used to be split: Worker D1 held auth (key_hash,
 * scope, ttl) while Supabase `cloud_connections` held UI metadata (label,
 * agent_kind, revoked_at). That's collapsed now: the Worker `name` field
 * carries `[kind] label` and a `revoked_at` column carries the audit
 * marker. Cloud and Edge both read/write the same place.
 *
 * Per-edition concerns left out of this layer:
 *   - getPrincipal()           — Cloud: Supabase auth; Edge: cookie check.
 *   - getPrimaryWorkspace()    — Cloud: cloud_workspaces lookup; Edge: env.
 *   - workspace CRUD           — Cloud: Supabase; Edge: stubs.
 */

import { cloudAdminListKeys } from "../drive/admin";
import type { AgentKind, Connection } from "./types";

const KIND_PREFIX = /^\[([a-z-]+)\]\s*/;

const VALID_KINDS: ReadonlySet<AgentKind> = new Set([
  "claude-code",
  "cursor",
  "desktop",
  "openclaw",
  "hermes",
  "raw-curl",
  "other",
]);

/** Decode a Worker `api_keys.name` field back into { label, agentKind }. */
export function parseName(raw: string | null): {
  label: string;
  agentKind: AgentKind;
} {
  if (!raw) return { label: "(unnamed)", agentKind: "other" };
  const m = raw.match(KIND_PREFIX);
  if (m) {
    const candidate = m[1] as AgentKind;
    const kind = VALID_KINDS.has(candidate) ? candidate : "other";
    return { label: raw.slice(m[0].length) || "(unnamed)", agentKind: kind };
  }
  // Pre-migration rows have no [kind] prefix — fall back to "other" and
  // surface the raw text as the label.
  return { label: raw, agentKind: "other" };
}

/** Encode { label, agentKind } into the Worker `api_keys.name` field. */
export function encodeName(label: string, kind: AgentKind): string {
  return `[${kind}] ${label}`;
}

/** The 5 connection-management methods of IdentityService. */
export interface WorkerBackedConnections {
  listConnections(workspaceId: string): Promise<Connection[]>;
  insertConnection(): Promise<void>;
  markConnectionRevoked(): Promise<void>;
  ownsConnection(keyId: string): Promise<boolean>;
  formatMintName(label: string, kind: AgentKind): string;
}

export interface WorkerBackedConnectionsOptions {
  /**
   * Resolve the huozi-cloud `workspace_id` (e.g. `ws_dachein-research`) the
   * current principal owns. Used as the authz boundary for ownsConnection:
   * a key only "belongs to me" if it lives in my workspace. Return null if
   * the principal has no workspace yet (treat all keys as not-owned).
   */
  getWorkspaceId(): Promise<string | null>;
}

/**
 * Build the shared connection methods. Both `cloud.ts` and `edge.ts`
 * compose this — they only differ in how they resolve the workspace_id
 * for the current principal.
 */
export function createWorkerBackedConnections(
  opts: WorkerBackedConnectionsOptions,
): WorkerBackedConnections {
  return {
    async listConnections(workspaceId): Promise<Connection[]> {
      let rows: Awaited<ReturnType<typeof cloudAdminListKeys>> = [];
      try {
        rows = await cloudAdminListKeys(workspaceId);
      } catch {
        return [];
      }
      return rows.map((row) => {
        const { label, agentKind } = parseName(row.name);
        return {
          id: row.key_id,
          keyId: row.key_id,
          label,
          agentKind,
          createdAt: new Date(row.created_at).toISOString(),
          revokedAt: row.revoked_at
            ? new Date(row.revoked_at).toISOString()
            : null,
        };
      });
    },

    async insertConnection(): Promise<void> {
      // No-op: the mint route already encodes [kind] label into the
      // Worker's `api_keys.name` at creation time. There's no parallel
      // metadata store to write to anymore.
    },

    async markConnectionRevoked(): Promise<void> {
      // No-op: the revoke route calls `cloudAdminRevokeKey(keyId)` which
      // soft-deletes the row in D1 (sets revoked_at). No parallel store.
    },

    async ownsConnection(keyId: string): Promise<boolean> {
      const workspaceId = await opts.getWorkspaceId();
      if (!workspaceId) return false;
      try {
        const rows = await cloudAdminListKeys(workspaceId);
        return rows.some((r) => r.key_id === keyId);
      } catch {
        return false;
      }
    },

    formatMintName(label, kind): string {
      return encodeName(label, kind);
    },
  };
}
