/**
 * Server-side helper for calling huozi-cloud's /auth/otp/* routes.
 *
 * These routes are *public* (no admin secret), but they live on the Worker
 * because that's where D1 is. Next.js proxies to them so the browser only
 * ever talks to its own origin. Outbound goes through the CLOUD service
 * binding when running on Cloudflare; falls back to public HTTP locally.
 */

import { cloudFetch } from "@/lib/cloud-fetch";

export interface OtpRequestResult {
  ok: true;
  expires_in: number;
}

export async function workerOtpRequest(
  email: string,
): Promise<{ ok: true; expires_in: number } | { ok: false; error: string; status: number }> {
  const res = await cloudFetch("/auth/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "request_failed" }))) as { error?: string };
    return { ok: false, error: body.error ?? "request_failed", status: res.status };
  }
  return (await res.json()) as { ok: true; expires_in: number };
}

export interface OtpWorkspace {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export interface OtpVerifySuccess {
  ok: true;
  user: { id: string; email: string; display_name: string | null };
  workspaces: OtpWorkspace[];
  /** Auto-bound workspace UUID when the user has exactly one membership;
   *  null otherwise (UI bounces to /onboard or /select-workspace). */
  wsid: string | null;
  token: string;
}

export async function workerOtpVerify(
  email: string,
  code: string,
): Promise<OtpVerifySuccess | { ok: false; error: string; status: number }> {
  const res = await cloudFetch("/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "verify_failed" }))) as { error?: string };
    return { ok: false, error: body.error ?? "verify_failed", status: res.status };
  }
  return (await res.json()) as OtpVerifySuccess;
}

export interface SelectWorkspaceResult {
  ok: true;
  wsid: string;
  role: string;
  token: string;
}

export async function workerSelectWorkspace(opts: {
  cookieHeader: string;
  workspaceId: string;
}): Promise<
  SelectWorkspaceResult | { ok: false; error: string; status: number }
> {
  const res = await cloudFetch("/auth/select-workspace", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: opts.cookieHeader,
    },
    body: JSON.stringify({ workspace_id: opts.workspaceId }),
  });
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: "select_failed" }))) as { error?: string };
    return { ok: false, error: body.error ?? "select_failed", status: res.status };
  }
  return (await res.json()) as SelectWorkspaceResult;
}
