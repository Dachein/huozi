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
  name: string | null;
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
