/**
 * Edge edition — identity implementation for self-hosted deployments.
 *
 * Auth model (Phase A, current):
 *   - Primary: JWT session cookie (`huozi_session`), set by either the
 *     `/admin/setup` first-run flow, the `/auth/edge-login` password
 *     login, or the `/invite/<token>/edge-accept` invite redemption.
 *     We read the JWT, verify against `HUOZI_AUTH_SECRET`, and use its
 *     claims as the principal. This is the same shape Cloud uses, so
 *     downstream code (cookie refresh, `/workspace`) is uniform.
 *   - Legacy: api-key cookie (`huozi_key`), set by the older
 *     paste-key flow at `/connect`. Still accepted to keep existing
 *     installs working without a forced re-login. Anyone with the api
 *     key is treated as the workspace's admin user.
 *
 * Workspace metadata: still pinned at deploy time via
 * `HUOZI_EDGE_WORKSPACE_SLUG` / `HUOZI_EDGE_WORKSPACE_NAME`. There's
 * exactly one workspace per Edge deployment.
 *
 * Differences vs Cloud (`identity/cloud.ts`):
 *   - Edge has no slug picker / signup / multi-workspace flow — those
 *     methods are no-ops or fixed-error.
 *   - Edge's "primary workspace" is env-derived, not D1-derived.
 *   - Edge accepts the legacy api-key cookie as a fallback.
 */

import { cookies } from "next/headers";
import { getEdgeWorkspaceSlug, getEdgeWorkspaceName } from "../edition";
import { slugToWorkspaceId } from "../drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "../drive/mcp-client";
import { SESSION_COOKIE_NAME, verifySession } from "../auth/jwt";
import { createWorkerBackedConnections } from "./connections";
import type {
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

interface EdgeSession {
  userId: string;
  email?: string;
  displayLabel: string;
}

/**
 * Read whichever credential is present and return a uniform shape.
 * JWT first (the new password-based flow); api-key cookie second
 * (legacy paste-key flow). Returns null only if neither is valid.
 */
async function readEdgeSession(): Promise<EdgeSession | null> {
  const store = await cookies();

  // ── JWT path (Phase A onwards) ───────────────────────────────────
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const claims = await verifySession(token);
    if (claims) {
      return {
        userId: claims.sub,
        email: claims.email,
        displayLabel: claims.email || claims.sub.slice(0, 8),
      };
    }
  }

  // ── Legacy api-key path (`/connect` paste flow) ──────────────────
  const apiKey = store.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (apiKey && apiKey.startsWith("hz_")) {
    // The legacy flow doesn't carry an email — surface a stable
    // "admin" label so the user menu has something to render.
    return {
      userId: "admin",
      displayLabel: "admin",
    };
  }

  return null;
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
      const session = await readEdgeSession();
      if (!session) return null;
      return slugToWorkspaceId(getEdgeWorkspaceSlug());
    },
  });

  return {
    async getPrincipal(): Promise<Principal | null> {
      const session = await readEdgeSession();
      if (!session) return null;
      return {
        userId: session.userId,
        email: session.email,
        displayLabel: session.displayLabel,
        // Edge: any signed-in user is treated as admin (single workspace,
        // single trust boundary). RBAC for Edge invitees is a follow-up.
        isAdmin: true,
        workspaceId: slugToWorkspaceId(getEdgeWorkspaceSlug()),
      };
    },

    async getPrimaryWorkspace(): Promise<Workspace | null> {
      const session = await readEdgeSession();
      if (!session) return null;
      return fixedWorkspace();
    },

    async isSlugAvailable(): Promise<boolean> {
      // The single Edge workspace exists as soon as the deployer
      // completes /admin/setup. There's no "available" slug to pick.
      return false;
    },

    async createWorkspace(): Promise<CreateWorkspaceResult> {
      // Edge workspaces are provisioned at deploy time via env vars.
      // The web flow doesn't own this step.
      return {
        ok: false,
        error: "slug_taken",
        message:
          "Edge deployments use a single fixed workspace. Configure HUOZI_EDGE_WORKSPACE_SLUG at deploy time.",
      };
    },

    async deleteWorkspace(): Promise<void> {
      // No-op — Edge workspaces are env-pinned, can't be deleted via web.
    },

    listConnections: connections.listConnections,
    insertConnection: connections.insertConnection,
    markConnectionRevoked: connections.markConnectionRevoked,
    ownsConnection: connections.ownsConnection,
    formatMintName: connections.formatMintName,
  };
}
