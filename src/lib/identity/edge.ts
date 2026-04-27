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
import { slugToWorkspaceId } from "../drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "../drive/mcp-client";
import { createWorkerBackedConnections } from "./connections";
import type {
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

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
  const connections = createWorkerBackedConnections({
    async getWorkspaceId() {
      const key = await hasValidSessionCookie();
      if (!key) return null;
      return slugToWorkspaceId(getEdgeWorkspaceSlug());
    },
  });

  return {
    async getPrincipal(): Promise<Principal | null> {
      const key = await hasValidSessionCookie();
      if (!key) return null;
      return {
        userId: "admin",
        displayLabel: "admin",
        isAdmin: true,
        workspaceId: slugToWorkspaceId(getEdgeWorkspaceSlug()),
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

    listConnections: connections.listConnections,
    insertConnection: connections.insertConnection,
    markConnectionRevoked: connections.markConnectionRevoked,
    ownsConnection: connections.ownsConnection,
    formatMintName: connections.formatMintName,
  };
}
