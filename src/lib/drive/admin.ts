/**
 * Server-side helper for calling huozi-cloud's admin endpoints.
 *
 * The admin secret lives in Next.js env (`HUOZI_ADMIN_SECRET`, same secret
 * set on the cloud worker via `wrangler secret put`). It must NEVER reach a
 * browser: only import this module from server components or API routes.
 */

const CLOUD_URL = process.env.HUOZI_CLOUD_URL ?? "https://cloud.huozi.app";

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
  const res = await fetch(`${CLOUD_URL}/admin/mint-key`, {
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
  const res = await fetch(`${CLOUD_URL}/admin/update-key-ttl`, {
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
): Promise<ListedKey[]> {
  const res = await fetch(
    `${CLOUD_URL}/admin/list-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret() },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "?");
    throw new Error(`list-keys failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { keys: ListedKey[] };
  return json.keys ?? [];
}

export async function cloudAdminRevokeKey(
  keyId: string,
): Promise<{ deleted: number }> {
  const res = await fetch(`${CLOUD_URL}/admin/revoke-key`, {
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
  return (await res.json()) as { deleted: number };
}

/**
 * Translate a cloud_workspaces.slug (e.g. "dachein-research") to the
 * huozi-cloud workspace_id string (e.g. "ws_dachein-research").
 */
export function slugToWorkspaceId(slug: string): string {
  return `ws_${slug}`;
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
  const res = await fetch(
    `${CLOUD_URL}/admin/device-inspect?user_code=${encodeURIComponent(userCode)}`,
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
  const res = await fetch(`${CLOUD_URL}/admin/device-authorize`, {
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
  const res = await fetch(`${CLOUD_URL}/admin/device-deny`, {
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
