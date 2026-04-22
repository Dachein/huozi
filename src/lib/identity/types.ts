/**
 * Identity domain types — the vocabulary that the rest of huozi.app uses to
 * talk about "who is this request, and what workspace do they own?".
 *
 * The Cloud edition backs these with Supabase; Edge backs them with a single
 * admin principal. Callers don't need to know which.
 */

/** Someone holding an authenticated session. */
export interface Principal {
  /** Stable identifier. Supabase user uuid in Cloud; `"admin"` in Edge. */
  userId: string;
  email?: string;
  /** Short human-readable label for UI. */
  displayLabel: string;
  /** True when this principal has root admin powers (always true in Edge). */
  isAdmin: boolean;
}

/** A cloud-drive workspace owned by a Principal. */
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export type AgentKind =
  | "claude-code"
  | "cursor"
  | "desktop"
  | "openclaw"
  | "hermes"
  | "raw-curl"
  | "other";

/** One API key issued against a workspace, as the UI knows it. */
export interface Connection {
  id: string;
  keyId: string;
  label: string;
  agentKind: AgentKind;
  createdAt: string;
  revokedAt: string | null;
}

/** The Identity contract. All calls are async and may hit the network / DB. */
export interface IdentityService {
  // ── Principal ─────────────────────────────────────────────────────────
  getPrincipal(): Promise<Principal | null>;

  // ── Workspaces ────────────────────────────────────────────────────────
  getPrimaryWorkspace(): Promise<Workspace | null>;
  isSlugAvailable(slug: string): Promise<boolean>;
  createWorkspace(input: {
    slug: string;
    name: string;
  }): Promise<CreateWorkspaceResult>;
  /** Best-effort cleanup used by multi-step onboarding rollback. */
  deleteWorkspace(id: string): Promise<void>;

  // ── Connections ───────────────────────────────────────────────────────
  listConnections(workspaceId: string): Promise<Connection[]>;
  insertConnection(input: {
    workspaceId: string;
    keyId: string;
    label: string;
    agentKind: AgentKind;
  }): Promise<void>;
  markConnectionRevoked(keyId: string): Promise<void>;
  /** Authorization check — does the current principal own this key? */
  ownsConnection(keyId: string): Promise<boolean>;

  /**
   * Edition-specific encoding of a connection's label+kind into the string
   * that will be stored in huozi-cloud's `api_keys.name` field.
   *
   * - Cloud: returns the plain label (kind lives in `cloud_connections.agent_kind`).
   * - Edge: returns `"[<kind>] <label>"` so the kind survives in D1 alone.
   */
  formatMintName(label: string, kind: AgentKind): string;
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: Workspace }
  | {
      ok: false;
      error: "slug_taken" | "slug_format" | "not_authenticated" | "db_error";
      message?: string;
    };
