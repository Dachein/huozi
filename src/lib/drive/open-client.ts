/**
 * Client for huozi-cloud's `/o/<token>` open-render endpoint.
 *
 * Sister to `lib/drive/shares.ts:getShare`. The open endpoint serves a
 * single file authorized by a short-lived signed JWT in the URL — no
 * D1 row, no slug. Response shape mirrors share content so the SSR
 * renderer can branch on the same fields.
 */

import { cloudFetch } from "@/lib/cloud-fetch";

export interface OpenContent {
  ok: true;
  file_path: string;
  mime_type: string;
  size: number;
  blob_sha: string;
  commit_sha: string;
  /** UTF-8 text for text/* + application/json. Absent for binaries. */
  text?: string;
  /** Base64-encoded bytes for binary files. */
  binary_base64?: string;
}

interface ErrorResponse {
  ok: false;
  errorCode: number;
  message: string;
}

export type OpenResult =
  | { ok: true; data: OpenContent }
  | ErrorResponse;

export async function getOpen(token: string): Promise<OpenResult> {
  try {
    const res = await cloudFetch(`/o/${encodeURIComponent(token)}`, {
      method: "GET",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as
      | OpenContent
      | { error?: string; message?: string };
    if (!res.ok || !("ok" in body) || !body.ok) {
      const err = body as { error?: string; message?: string };
      return {
        ok: false,
        errorCode: res.status,
        message: err.message ?? err.error ?? "unknown",
      };
    }
    return { ok: true, data: body };
  } catch (err) {
    return {
      ok: false,
      errorCode: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
