/**
 * Cloud edition — D1-backed Identity implementation.
 *
 * Phase A moved auth (login + sessions) to D1.
 * Phase B (this) moves workspace metadata to D1 too. Cloud edition no
 * longer touches Supabase at all — `getPrincipal` reads the JWT cookie,
 * `getPrimaryWorkspace` / `createWorkspace` go through Worker admin
 * routes that read/write D1 directly.
 *
 * The connections methods are imported from `./connections` and shared
 * with Edge — both editions are now byte-identical at this layer.
 */

import { cookies } from "next/headers";
import {
  cloudAdminCheckSlug,
  cloudAdminCreateWorkspace,
  cloudAdminDeleteWorkspace,
  cloudAdminListWorkspaces,
  slugToWorkspaceId,
  type WorkspaceRow,
} from "@/lib/drive/admin";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/jwt";
import { createWorkerBackedConnections } from "./connections";
import type {
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function readSessionFromCookie(): Promise<{
  userId: string;
  email: string;
  wsid?: string;
} | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  return { userId: claims.sub, email: claims.email, wsid: claims.wsid };
}

export async function createCloudIdentity(): Promise<IdentityService> {
  async function currentUserId(): Promise<string | null> {
    const session = await readSessionFromCookie();
    return session?.userId ?? null;
  }

  async function currentBoundWorkspace(): Promise<Workspace | null> {
    const session = await readSessionFromCookie();
    if (!session?.wsid) return null;
    let rows: WorkspaceRow[] = [];
    try {
      rows = await cloudAdminListWorkspaces({ id: session.wsid });
    } catch {
      return null;
    }
    return rows.length > 0 ? rowToWorkspace(rows[0]!) : null;
  }

  const connections = createWorkerBackedConnections({
    async getWorkspaceId() {
      const ws = await currentBoundWorkspace();
      return ws ? slugToWorkspaceId(ws.slug) : null;
    },
  });

  return {
    async getPrincipal(): Promise<Principal | null> {
      const session = await readSessionFromCookie();
      if (!session) return null;
      return {
        userId: session.userId,
        email: session.email,
        displayLabel: session.email || session.userId.slice(0, 8),
        isAdmin: false,
        workspaceId: session.wsid ?? null,
      };
    },

    async getPrimaryWorkspace(): Promise<Workspace | null> {
      return currentBoundWorkspace();
    },

    async isSlugAvailable(slug: string): Promise<boolean> {
      if (!SLUG_RE.test(slug)) return false;
      try {
        return await cloudAdminCheckSlug(slug);
      } catch {
        return false;
      }
    },

    async createWorkspace(input): Promise<CreateWorkspaceResult> {
      const userId = await currentUserId();
      if (!userId) return { ok: false, error: "not_authenticated" };
      if (!SLUG_RE.test(input.slug)) {
        return {
          ok: false,
          error: "slug_format",
          message:
            "Slug must be 3–64 lowercase letters, digits, or hyphens; cannot start or end with a hyphen.",
        };
      }

      const result = await cloudAdminCreateWorkspace({
        owner_id: userId,
        slug: input.slug,
        name: input.name,
      });
      if (!result.ok) {
        if (result.error === "slug_taken") {
          return {
            ok: false,
            error: "slug_taken",
            message: "That name is already taken.",
          };
        }
        if (result.error === "slug_format") {
          return {
            ok: false,
            error: "slug_format",
            message: result.message,
          };
        }
        return {
          ok: false,
          error: "db_error",
          message: result.message ?? result.error,
        };
      }
      return { ok: true, workspace: rowToWorkspace(result.workspace) };
    },

    async deleteWorkspace(id: string): Promise<void> {
      try {
        await cloudAdminDeleteWorkspace(id);
      } catch {
        // best-effort — used for onboarding rollback only.
      }
    },

    listConnections: connections.listConnections,
    insertConnection: connections.insertConnection,
    markConnectionRevoked: connections.markConnectionRevoked,
    ownsConnection: connections.ownsConnection,
    formatMintName: connections.formatMintName,

    supportsEmailIngest(): boolean {
      return true;
    },
  };
}
