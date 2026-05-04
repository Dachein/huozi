/**
 * Identity domain types — the vocabulary that the rest of huozi.app uses to
 * talk about "who is this request, and what workspace do they own?".
 *
 * Both editions back these with D1 via the huozi-cloud Worker. The Cloud
 * impl resolves the principal from a JWT cookie (email-OTP issued); the
 * Edge impl resolves it from the api_key cookie (single "admin" principal).
 * Callers don't need to know which.
 */

/** Someone holding an authenticated session. */
export interface Principal {
  /** Stable identifier. D1 users.id in Cloud; `"admin"` in Edge. */
  userId: string;
  email?: string;
  /** Short human-readable label for UI. */
  displayLabel: string;
  /** True when this principal has root admin powers (always true in Edge). */
  isAdmin: boolean;
  /**
   * Workspace currently bound to this session via the JWT `wsid` claim.
   * Null when the user is signed in but hasn't picked a workspace yet
   * (multi-membership case → /select-workspace; or no memberships →
   * /onboard). Edge always has a workspaceId (the fixed admin workspace).
   */
  workspaceId: string | null;
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
  | "codex"
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
   * Encode a connection's label+kind into the `api_keys.name` field —
   * `"[<kind>] <label>"`. Both editions use the same encoding now that
   * connection metadata lives entirely in D1.
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
