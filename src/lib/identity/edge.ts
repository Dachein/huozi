/**
 * Edge edition — identity implementation for self-hosted deployments.
 *
 * Assumptions (see AGENTS.md → "Editions"):
 *   - Single deployer, single workspace. Slug comes from
 *     `HUOZI_EDGE_WORKSPACE_SLUG` (default `"default"`).
 *   - No Supabase, no OAuth, no email login.
 *   - "Who is this request?" resolves to `"admin"` whenever there's a
 *     valid API-key cookie. Invalid / missing cookie → null principal.
 *   - The one workspace is represented by the huozi-cloud `api_keys`
 *     rows addressed to `ws_<slug>`. There's no separate metadata table.
 *
 * Bootstrap flow (MVP — no web UI):
 *   1. Deployer sets `HUOZI_ADMIN_SECRET` on both the huozi-cloud Worker
 *      and this Next.js app.
 *   2. Deployer runs a one-shot CLI (or curl) against the Worker's
 *      `/admin/mint-key` to mint the first key:
 *        curl -X POST <worker>/admin/mint-key \
 *          -H "X-Admin-Secret: $HUOZI_ADMIN_SECRET" \
 *          -d '{"workspace_id":"ws_default","principal_id":"admin",
 *               "principal_type":"user","name":"Admin · browser"}'
 *   3. Deployer visits `/connect` and pastes the returned key.
 *   4. From then on the `/workspace/connect` UI mints additional keys
 *      for Agents normally; manage them inline from `/workspace`.
 */

import { cookies } from "next/headers";
import { getEdgeWorkspaceSlug, getEdgeWorkspaceName } from "../edition";
import { cloudAdminListKeys, slugToWorkspaceId } from "../drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "../drive/mcp-client";
import type {
  Connection,
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

/** Prefix encoding for agent_kind inside the Worker's api_keys.name field. */
const KIND_PREFIX = /^\[([a-z-]+)\]\s*/;

function parseName(raw: string | null): {
  label: string;
  agentKind: Connection["agentKind"];
} {
  if (!raw) return { label: "(unnamed)", agentKind: "other" };
  const m = raw.match(KIND_PREFIX);
  if (m) {
    const kind = m[1] as Connection["agentKind"];
    return { label: raw.slice(m[0].length) || "(unnamed)", agentKind: kind };
  }
  return { label: raw, agentKind: "other" };
}

function encodeName(label: string, kind: Connection["agentKind"]): string {
  return `[${kind}] ${label}`;
}

async function hasValidSessionCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!value || !value.startsWith("hz_")) return null;
  return value;
}

function fixedWorkspace(): Workspace {
  const slug = getEdgeWorkspaceSlug();
  return {
    id: slugToWorkspaceId(slug),
    slug,
    name: getEdgeWorkspaceName(),
    ownerId: "admin",
    createdAt: new Date(0).toISOString(),
  };
}

export async function createEdgeIdentity(): Promise<IdentityService> {
  return {
    async getPrincipal(): Promise<Principal | null> {
      const key = await hasValidSessionCookie();
      if (!key) return null;
      return {
        userId: "admin",
        displayLabel: "admin",
        isAdmin: true,
      };
    },

    async getPrimaryWorkspace(): Promise<Workspace | null> {
      const key = await hasValidSessionCookie();
      if (!key) return null;
      return fixedWorkspace();
    },

    async isSlugAvailable(): Promise<boolean> {
      // The single Edge workspace exists as soon as the deployer mints the
      // first key against it. There's no "available" slug to pick.
      return false;
    },

    async createWorkspace(): Promise<CreateWorkspaceResult> {
      // Edge workspaces are provisioned out-of-band via the Worker's
      // /admin/mint-key endpoint. The web flow doesn't own that step.
      return {
        ok: false,
        error: "slug_taken",
        message:
          "Edge deployments use a single fixed workspace. Configure HUOZI_EDGE_WORKSPACE_SLUG at deploy time.",
      };
    },

    async deleteWorkspace(): Promise<void> {
      // No-op — we'd never want this to succeed on Edge.
    },

    async listConnections(workspaceId: string): Promise<Connection[]> {
      // Delegate to huozi-cloud admin API. `name` encodes label + agent_kind.
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
          // Edge has no "revoked but retained" state: revoke = delete. Any
          // row we see here is live.
          revokedAt: null,
        };
      });
    },

    async insertConnection(): Promise<void> {
      // In Cloud we have a parallel `cloud_connections` table; Edge stores
      // everything inside huozi-cloud's api_keys row. The mint route is
      // already responsible for setting `name` on the admin mint call;
      // there is nothing extra to record here.
    },

    async markConnectionRevoked(): Promise<void> {
      // No-op. The revoke API route calls `cloudAdminRevokeKey(keyId)`
      // which physically removes the row in huozi-cloud. Anything not in
      // the list anymore is revoked by construction.
    },

    async ownsConnection(keyId: string): Promise<boolean> {
      // In Edge, every key in our single workspace belongs to the admin.
      const workspaceId = slugToWorkspaceId(getEdgeWorkspaceSlug());
      try {
        const rows = await cloudAdminListKeys(workspaceId);
        return rows.some((r) => r.key_id === keyId);
      } catch {
        return false;
      }
    },

    formatMintName(label: string, kind): string {
      return encodeName(label, kind);
    },
  };
}
