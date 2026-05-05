/**
 * Server-only helpers for the OAuth 2.1 admin endpoints on huozi-cloud.
 *
 * Same pattern as `@/lib/drive/admin` — uses HUOZI_ADMIN_SECRET, must never
 * import from a client component.
 */

import { cloudFetch } from "@/lib/cloud-fetch";

function adminSecret(): string {
  const s = process.env.HUOZI_ADMIN_SECRET;
  if (!s) throw new Error("HUOZI_ADMIN_SECRET not configured");
  return s;
}

export interface PendingAuthorization {
  session_id: string;
  client_id: string;
  client_name: string | null;
  client_uri: string | null;
  redirect_uri: string;
  scope: string | null;
  state: string | null;
  expires_at: number;
}

export type InspectPendingResult =
  | { ok: true; data: PendingAuthorization }
  | { ok: false; error: string; status: number };

/** Fetch the pending /authorize request for the given session_id. */
export async function oauthInspectPending(
  sessionId: string,
): Promise<InspectPendingResult> {
  const res = await cloudFetch(`/admin/oauth/inspect-pending`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    return { ok: false, error: body.error ?? "unknown", status: res.status };
  }
  return { ok: true, data: (await res.json()) as PendingAuthorization };
}

export type ApproveResult =
  | { ok: true; redirect_url: string }
  | { ok: false; error: string; status: number };

export async function oauthApprove(input: {
  session_id: string;
  user_id: string;
  /** ws_<slug> form. */
  workspace_id: string;
  agent_kind?: string;
  label?: string;
}): Promise<ApproveResult> {
  const res = await cloudFetch(`/admin/oauth/approve`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    return { ok: false, error: body.error ?? "unknown", status: res.status };
  }
  const data = (await res.json()) as { redirect_url: string };
  return { ok: true, redirect_url: data.redirect_url };
}

export async function oauthDeny(input: {
  session_id: string;
  error?: string;
}): Promise<ApproveResult> {
  const res = await cloudFetch(`/admin/oauth/deny`, {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret(),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    return { ok: false, error: body.error ?? "unknown", status: res.status };
  }
  const data = (await res.json()) as { redirect_url: string };
  return { ok: true, redirect_url: data.redirect_url };
}
