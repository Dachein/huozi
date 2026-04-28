/**
 * Client for huozi-cloud's /shares/* endpoints.
 *
 * Two flavours of calls:
 *   - Anonymous (`getShare`, `unlockShare`) — public visitor flows
 *   - Owner (`createShare`, `listShares`, `revokeShare`) — needs a Bearer key
 *
 * Both sides talk to the same Worker.
 */

import { cloudFetch } from '@/lib/cloud-fetch'

export interface ShareMetadata {
  slug: string
  file_path: string
  blob_sha: string
  commit_sha: string
  has_passcode: boolean
  created_at: number
}

export interface ShareContent extends ShareMetadata {
  locked: false
  mime_type: string
  size: number
  text?: string
  binary_base64?: string
}

export interface LockedShare extends ShareMetadata {
  locked: true
}

export type ShareResponse = ShareContent | LockedShare

export interface CreateShareInput {
  file_path: string
  passcode?: string
  /** TTL in seconds; omit / null / 0 = never expires. */
  expires_in_seconds?: number | null
}

interface ErrorResponse {
  ok: false
  errorCode: number
  message: string
}

type Result<T> = { ok: true; data: T } | ErrorResponse

export async function getShare(slug: string): Promise<Result<ShareResponse>> {
  try {
    const res = await cloudFetch(`/shares/${encodeURIComponent(slug)}`, {
      method: 'GET',
      cache: 'no-store',
    })
    const body = (await res.json()) as
      | ({ ok: true } & ShareResponse)
      | { error: string }
    if (!res.ok || !('ok' in body) || !body.ok) {
      return {
        ok: false,
        errorCode: res.status,
        message: ('error' in body ? body.error : 'unknown') || 'unknown',
      }
    }
    // Strip the top-level ok so we return the payload shape cleanly.
    const { ok: _ok, ...rest } = body as { ok: true } & ShareResponse
    return { ok: true, data: rest as ShareResponse }
  } catch (err) {
    return {
      ok: false,
      errorCode: 0,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function unlockShare(
  slug: string,
  passcode: string,
): Promise<Result<ShareContent>> {
  try {
    const res = await cloudFetch(
      `/shares/${encodeURIComponent(slug)}/unlock`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
        cache: 'no-store',
      },
    )
    const body = (await res.json()) as
      | ({ ok: true } & ShareContent)
      | { error: string }
    if (!res.ok || !('ok' in body) || !body.ok) {
      return {
        ok: false,
        errorCode: res.status,
        message: ('error' in body ? body.error : 'unknown') || 'unknown',
      }
    }
    const { ok: _ok, ...rest } = body as { ok: true } & ShareContent
    return { ok: true, data: rest as ShareContent }
  } catch (err) {
    return {
      ok: false,
      errorCode: 0,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Owner-side: requires the workspace's API key ────────────────────────

export async function createShare(
  key: string,
  input: CreateShareInput,
): Promise<
  | {
      ok: true
      slug: string
      file_path: string
      blob_sha: string
      commit_sha: string
      has_passcode: boolean
      created_at: number
      expires_at: number | null
    }
  | { ok: false; error?: string; message: string; status: number }
> {
  try {
    const res = await cloudFetch(`/shares`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    })
    const body = (await res.json()) as Record<string, unknown>
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        status: res.status,
        error: (body.error as string) || undefined,
        message:
          (body.message as string) || (body.error as string) || `HTTP ${res.status}`,
      }
    }
    return body as {
      ok: true
      slug: string
      file_path: string
      blob_sha: string
      commit_sha: string
      has_passcode: boolean
      created_at: number
      expires_at: number | null
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export interface OwnerShareRow {
  slug: string
  file_path: string
  blob_sha: string
  commit_sha: string
  has_passcode: boolean
  created_at: number
  revoked_at: number | null
  expires_at: number | null
  view_count: number
}

export async function listShares(
  key: string,
): Promise<
  | { ok: true; shares: OwnerShareRow[] }
  | { ok: false; message: string }
> {
  try {
    const res = await cloudFetch(`/shares`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as { ok?: boolean; shares?: OwnerShareRow[] }
    if (!body.ok || !Array.isArray(body.shares)) {
      return { ok: false, message: 'bad_response' }
    }
    return { ok: true, shares: body.shares }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function revokeShare(
  key: string,
  slug: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await cloudFetch(
      `/shares/${encodeURIComponent(slug)}/revoke`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
      },
    )
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
