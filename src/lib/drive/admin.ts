/**
 * Server-side helper for calling huozi-cloud's admin endpoints.
 *
 * The admin secret lives in Next.js env (`HUOZI_ADMIN_SECRET`, same secret
 * set on the cloud worker via `wrangler secret put`). It must NEVER reach a
 * browser: only import this module from server components or API routes.
 *
 * Outbound calls go through the CLOUD service binding when running on
 * Cloudflare; falls back to public HTTP via HUOZI_CLOUD_URL during dev.
 */

import { cloudFetch } from "@/lib/cloud-fetch";

function adminSecret(): string {
  const s = process.env.HUOZI_ADMIN_SECRET;
  if (!s) {
    throw new Error(
      "HUOZI_ADMIN_SECRET not configured in Next.js environment",
    );
  }
  return s;
}

export interface MintKeyInput {
  workspace_id: string;
  principal_id: string;
  principal_type: "user" | "agent" | "system";
  scope_path?: string | null;
  name?: string;
}

export interface MintKeyResult {
  ok: true;
  key_id: string;
  api_key: string;
  workspace_id: string;
  principal_id: string;
  created_at: number;
}

export async function cloudAdminMintKey(
  input: MintKeyInput,
): Promise<MintKeyResult> {
  const res = await cloudFetch(`/admin/mint-key`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`mint-key failed: ${res.status} ${body}`);
  }
  return (await res.json()) as MintKeyResult;
}

export interface ListedKey {
  key_id: string;
  workspace_id: string;
  scope_path: string | null;
  principal_type: string;
  principal_id: string;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
  ttl_seconds: number | null;
  name: string | null;
  /** Last tool this key invoked via tools/call (e.g. "huozi_write"). */
  last_action_tool: string | null;
  /** File path / pattern hint from the last tool call. */
  last_action_target: string | null;
  /** Unix ms when the key was revoked (soft-deleted). Null if active.
   *  The default list-keys call filters revoked rows server-side;
   *  callers that opt into `include_revoked=1` will see them here. */
  revoked_at: number | null;
  /** Non-null when this key was minted via the OAuth 2.1 + PKCE flow
   *  (prefix `oak_*`). Points at the issuing oauth_clients row. Null
   *  for statically-minted `hz_*` keys. The UI uses this to render an
   *  "OAuth" vs "API key" chip and to hide the TTL editor on
   *  OAuth-managed rows. */
  oauth_client_id: string | null;
}

/** Canonical TTL presets shown in the UI. `null` = never expires. */
export const TTL_PRESETS: ReadonlyArray<{
  seconds: number | null;
  labelKey: string;
}> = [
  { seconds: 1 * 86400, labelKey: "1d" },
  { seconds: 7 * 86400, labelKey: "7d" },
  { seconds: 30 * 86400, labelKey: "30d" },
  { seconds: 180 * 86400, labelKey: "180d" },
  { seconds: null, labelKey: "never" },
];

export async function cloudAdminUpdateKeyTtl(
  keyId: string,
  ttlSeconds: number | null,
): Promise<{
  ok: true;
  key_id: string;
  ttl_seconds: number | null;
  expires_at: number | null;
}> {
  const res = await cloudFetch(`/admin/update-key-ttl`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ key_id: keyId, ttl_seconds: ttlSeconds }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`update-key-ttl failed: ${res.status} ${body}`);
  }
  return (await res.json()) as {
    ok: true;
    key_id: string;
    ttl_seconds: number | null;
    expires_at: number | null;
  };
}

export async function cloudAdminListKeys(
  workspaceId: string,
  options?: { includeRevoked?: boolean },
): Promise<ListedKey[]> {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  if (options?.includeRevoked) qs.set("include_revoked", "1");
  const res = await cloudFetch(`/admin/list-keys?${qs.toString()}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`list-keys failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { keys: ListedKey[] };
  return json.keys ?? [];
}

export async function cloudAdminRevokeKey(
  keyId: string,
): Promise<{ revoked: number; revoked_at: number }> {
  const res = await cloudFetch(`/admin/revoke-key`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ key_id: keyId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`revoke-key failed: ${res.status} ${body}`);
  }
  return (await res.json()) as { revoked: number; revoked_at: number };
}

/**
 * Translate a workspace slug (e.g. "dachein-research") to the
 * huozi-cloud workspace_id string (e.g. "ws_dachein-research").
 */
export function slugToWorkspaceId(slug: string): string {
  return `ws_${slug}`;
}

// ── Workspaces (D1-backed metadata) ─────────────────────────────────────

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  created_at: number;
}

export interface CreateWorkspaceInput {
  slug: string;
  name: string;
  owner_id: string;
  /** Optional — preserve a UUID across migrations. */
  id?: string;
}

export async function cloudAdminCreateWorkspace(
  input: CreateWorkspaceInput,
): Promise<
  | { ok: true; workspace: WorkspaceRow }
  | { ok: false; error: string; status: number; message?: string }
> {
  const res = await cloudFetch(`/admin/workspaces`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "create_failed" }))) as {
      error?: string;
      message?: string;
    };
    return {
      ok: false,
      error: body.error ?? "create_failed",
      status: res.status,
      message: body.message,
    };
  }
  return (await res.json()) as { ok: true; workspace: WorkspaceRow };
}

export async function cloudAdminListWorkspaces(opts: {
  /** All workspaces this user is a member of (owned + invited). */
  memberId?: string;
  /** Only workspaces owned by this user. */
  ownerId?: string;
  /** Single lookup by slug. */
  slug?: string;
  /** Single lookup by UUID. */
  id?: string;
}): Promise<WorkspaceRow[]> {
  const qs = new URLSearchParams();
  if (opts.memberId) qs.set("member_id", opts.memberId);
  if (opts.ownerId) qs.set("owner_id", opts.ownerId);
  if (opts.slug) qs.set("slug", opts.slug);
  if (opts.id) qs.set("id", opts.id);
  const res = await cloudFetch(`/admin/workspaces?${qs.toString()}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`list-workspaces failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { workspaces: WorkspaceRow[] };
  return json.workspaces ?? [];
}

export async function cloudAdminCheckSlug(slug: string): Promise<boolean> {
  const res = await cloudFetch(
    `/admin/workspaces/check-slug?slug=${encodeURIComponent(slug)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (!res.ok) {
    return false;
  }
  const json = (await res.json()) as { available: boolean };
  return Boolean(json.available);
}

// ── Invites + members ───────────────────────────────────────────────────

export interface InviteSummary {
  email: string;
  role: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  inviter_email: string;
  expires_at: number;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export async function cloudAdminInspectInvite(
  token: string,
): Promise<InviteSummary | null> {
  const res = await cloudFetch(
    `/admin/invites/inspect?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`inspect-invite failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { invite: InviteSummary };
  return json.invite;
}

export async function cloudAdminMintInvite(input: {
  workspace_id: string;
  email: string;
  role?: "member";
  invited_by: string;
  /** Public URL base, e.g. "https://huozi.app/invite". */
  accept_url_base: string;
}): Promise<
  | { ok: true; token: string; expires_at: number; accept_url: string }
  | { ok: false; error: string; status: number; message?: string }
> {
  const res = await cloudFetch(`/admin/invites`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "mint_failed" }))) as {
      error?: string;
      message?: string;
    };
    return {
      ok: false,
      error: body.error ?? "mint_failed",
      status: res.status,
      message: body.message,
    };
  }
  return (await res.json()) as {
    ok: true;
    token: string;
    expires_at: number;
    accept_url: string;
  };
}

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: number;
  expires_at: number;
}

export async function cloudAdminListInvites(
  workspaceId: string,
): Promise<InviteRow[]> {
  const res = await cloudFetch(
    `/admin/invites?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { invites: InviteRow[] };
  return json.invites ?? [];
}

export async function cloudAdminRevokeInvite(token: string): Promise<void> {
  await cloudFetch(
    `/admin/invites?token=${encodeURIComponent(token)}`,
    {
      method: "DELETE",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
}

export async function cloudAdminRedeemInvite(input: {
  token: string;
  user_id: string;
}): Promise<
  | { ok: true; workspace_id: string; role: string }
  | { ok: false; error: string; status: number }
> {
  const res = await cloudFetch(`/admin/invites/redeem`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "redeem_failed" }))) as { error?: string };
    return {
      ok: false,
      error: body.error ?? "redeem_failed",
      status: res.status,
    };
  }
  return (await res.json()) as {
    ok: true;
    workspace_id: string;
    role: string;
  };
}

export interface MemberRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: number;
  invited_by: string | null;
}

export async function cloudAdminListMembers(
  workspaceId: string,
): Promise<MemberRow[]> {
  const res = await cloudFetch(
    `/admin/workspace-members?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { members: MemberRow[] };
  return json.members ?? [];
}

export async function cloudAdminRemoveMember(input: {
  workspace_id: string;
  user_id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const qs = new URLSearchParams({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
  });
  const res = await cloudFetch(`/admin/workspace-members?${qs}`, {
    method: "DELETE",
    headers: { "X-Admin-Secret": adminSecret() },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error };
  }
  return { ok: true };
}

// ── Folder ACLs ─────────────────────────────────────────────────────────

export interface FolderAclSummary {
  workspace_id: string;
  path_prefix: string;
  mode: "private";
  members: string[];
  last_changed_by: string;
  last_changed_at: number;
}

export async function cloudAdminListFolderAcls(opts: {
  workspaceId: string;
  pathPrefix?: string;
}): Promise<FolderAclSummary[]> {
  const qs = new URLSearchParams({ workspace_id: opts.workspaceId });
  if (opts.pathPrefix) qs.set("path_prefix", opts.pathPrefix);
  const res = await cloudFetch(`/admin/folder-acls?${qs}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret() },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { acls: FolderAclSummary[] };
  return json.acls ?? [];
}

export async function cloudAdminSetFolderAcl(input: {
  workspace_id: string;
  path_prefix: string;
  mode: "private";
  members: string[];
  changed_by: string;
}): Promise<
  | { ok: true; acl: FolderAclSummary }
  | { ok: false; error: string; status: number; message?: string }
> {
  const res = await cloudFetch(`/admin/folder-acls`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    return {
      ok: false,
      error: body.error ?? "set_failed",
      status: res.status,
      message: body.message,
    };
  }
  const acl = (await res.json()) as FolderAclSummary;
  return { ok: true, acl };
}

export async function cloudAdminDeleteFolderAcl(opts: {
  workspaceId: string;
  pathPrefix: string;
}): Promise<void> {
  const qs = new URLSearchParams({
    workspace_id: opts.workspaceId,
    path_prefix: opts.pathPrefix,
  });
  await cloudFetch(`/admin/folder-acls?${qs}`, {
    method: "DELETE",
    headers: { "X-Admin-Secret": adminSecret() },
  });
}

export async function cloudAdminListFolderAclsForUser(opts: {
  workspaceId: string;
  userId: string;
}): Promise<string[]> {
  const qs = new URLSearchParams({
    workspace_id: opts.workspaceId,
    user_id: opts.userId,
  });
  const res = await cloudFetch(`/admin/folder-acls/for-user?${qs}`, {
    method: "GET",
    headers: { "X-Admin-Secret": adminSecret() },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { path_prefixes: string[] };
  return json.path_prefixes ?? [];
}

export async function cloudAdminDeleteWorkspace(id: string): Promise<void> {
  const res = await cloudFetch(
    `/admin/workspaces?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`delete-workspace failed: ${res.status} ${body}`);
  }
}

// ── Device-flow admin helpers ─────────────────────────────────────────

export interface DeviceGrantSummary {
  user_code: string;
  client_name: string | null;
  agent_kind: string | null;
  status: "pending" | "authorized" | "denied" | "expired" | "consumed";
  created_at: number;
  expires_at: number;
}

/**
 * Server-side lookup of a device grant by user_code. Used by the
 * `/device` page to render client context before asking the user
 * to approve.
 */
export async function cloudAdminDeviceInspect(
  userCode: string,
): Promise<DeviceGrantSummary | null> {
  const res = await cloudFetch(
    `/admin/device-inspect?user_code=${encodeURIComponent(userCode)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`device-inspect failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { ok: true; grant: DeviceGrantSummary };
  return json.grant;
}

export async function cloudAdminDeviceAuthorize(input: {
  user_code: string;
  user_id: string;
  workspace_id: string;
  workspace_slug: string;
  label?: string;
}): Promise<{
  ok: true;
  key_id: string;
  agent_kind: string | null;
  client_name: string | null;
}> {
  const res = await cloudFetch(`/admin/device-authorize`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`device-authorize failed: ${res.status} ${body}`);
  }
  return (await res.json()) as {
    ok: true;
    key_id: string;
    agent_kind: string | null;
    client_name: string | null;
  };
}

export async function cloudAdminDeviceDeny(
  userCode: string,
): Promise<{ ok: true }> {
  const res = await cloudFetch(`/admin/device-deny`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ user_code: userCode }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`device-deny failed: ${res.status} ${body}`);
  }
  return (await res.json()) as { ok: true };
}
