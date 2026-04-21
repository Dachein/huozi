/**
 * Cloud edition — Supabase-backed Identity implementation.
 *
 * This is the ONLY module (outside `lib/supabase/*` itself) that touches
 * Supabase directly. Anything else reads from `@/lib/identity`.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Connection,
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface ConnectionRow {
  id: string;
  key_id: string;
  label: string;
  agent_kind: string;
  created_at: string;
  revoked_at: string | null;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

function rowToConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    keyId: row.key_id,
    label: row.label,
    agentKind: (row.agent_kind ?? "other") as Connection["agentKind"],
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function createCloudIdentity(): Promise<IdentityService> {
  const supabase = await createClient();

  async function currentUserId(): Promise<string | null> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
  }

  return {
    async getPrincipal(): Promise<Principal | null> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email ?? undefined,
        displayLabel: user.email ?? user.id.slice(0, 8),
        isAdmin: false,
      };
    },

    async getPrimaryWorkspace(): Promise<Workspace | null> {
      const userId = await currentUserId();
      if (!userId) return null;
      const { data } = await supabase
        .from("cloud_workspaces")
        .select("id, slug, name, owner_id, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<WorkspaceRow>();
      return data ? rowToWorkspace(data) : null;
    },

    async isSlugAvailable(slug: string): Promise<boolean> {
      if (!SLUG_RE.test(slug)) return false;
      const { data } = await supabase
        .from("cloud_workspaces")
        .select("id")
        .eq("slug", slug)
        .maybeSingle<{ id: string }>();
      return !data;
    },

    async createWorkspace(input): Promise<CreateWorkspaceResult> {
      const userId = await currentUserId();
      if (!userId) {
        return { ok: false, error: "not_authenticated" };
      }
      if (!SLUG_RE.test(input.slug)) {
        return {
          ok: false,
          error: "slug_format",
          message:
            "Slug must be 3–64 lowercase letters, digits, or hyphens; cannot start or end with a hyphen.",
        };
      }
      {
        const { data: existing } = await supabase
          .from("cloud_workspaces")
          .select("id")
          .eq("slug", input.slug)
          .maybeSingle();
        if (existing) {
          return {
            ok: false,
            error: "slug_taken",
            message: "That name is already taken.",
          };
        }
      }
      const { data, error } = await supabase
        .from("cloud_workspaces")
        .insert({ owner_id: userId, slug: input.slug, name: input.name })
        .select("id, slug, name, owner_id, created_at")
        .single<WorkspaceRow>();
      if (error || !data) {
        return { ok: false, error: "db_error", message: error?.message };
      }
      return { ok: true, workspace: rowToWorkspace(data) };
    },

    async deleteWorkspace(id: string): Promise<void> {
      await supabase.from("cloud_workspaces").delete().eq("id", id);
    },

    async listConnections(workspaceId: string): Promise<Connection[]> {
      const { data } = await supabase
        .from("cloud_connections")
        .select(
          "id, key_id, label, agent_kind, created_at, revoked_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      return (data ?? []).map((row) => rowToConnection(row as ConnectionRow));
    },

    async insertConnection(input): Promise<void> {
      const { error } = await supabase.from("cloud_connections").insert({
        workspace_id: input.workspaceId,
        key_id: input.keyId,
        label: input.label,
        agent_kind: input.agentKind,
      });
      if (error) {
        throw new Error(`insertConnection failed: ${error.message}`);
      }
    },

    async markConnectionRevoked(keyId: string): Promise<void> {
      const { error } = await supabase
        .from("cloud_connections")
        .update({ revoked_at: new Date().toISOString() })
        .eq("key_id", keyId);
      if (error) {
        throw new Error(`markConnectionRevoked failed: ${error.message}`);
      }
    },

    async ownsConnection(keyId: string): Promise<boolean> {
      // RLS on cloud_connections joins cloud_workspaces.owner_id, so a row
      // only comes back when the current user owns the enclosing workspace.
      const { data } = await supabase
        .from("cloud_connections")
        .select("id, cloud_workspaces!inner(owner_id)")
        .eq("key_id", keyId)
        .maybeSingle();
      return !!data;
    },

    formatMintName(label: string): string {
      // In Cloud the kind lives in `cloud_connections.agent_kind`, so the
      // Worker's `api_keys.name` can just be the human-readable label.
      return label;
    },
  };
}
