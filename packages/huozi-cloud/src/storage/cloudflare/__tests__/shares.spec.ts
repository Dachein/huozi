import { describe, expect, it } from 'vitest'
import {
  handleGetShare,
  handleUnlockShare,
  SHARE_EXPIRED_MESSAGE,
} from '../shares.js'

function envWithShareRow(row: Record<string, unknown> | null) {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              first: async () => row,
            }
          },
        }
      },
    },
  } as never
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('public share expiry errors', () => {
  const expiredShare = {
    slug: 'abc',
    workspace_id: 'ws_demo',
    file_path: 'dashboard.html',
    blob_sha: 'a'.repeat(40),
    commit_sha: 'b'.repeat(40),
    passcode_hash: null,
    created_at: Date.now() - 10_000,
    revoked_at: null,
    expires_at: Date.now() - 1_000,
    view_count: 0,
    created_by: 'user_demo',
  }

  it('keeps /shares/:slug at 404 while returning a stable expired payload', async () => {
    const res = await handleGetShare(
      new Request('https://example.test/shares/abc'),
      envWithShareRow(expiredShare),
      'abc',
    )
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({
      error: 'share_expired',
      message: SHARE_EXPIRED_MESSAGE,
    })
  })

  it('returns the same expired payload from the unlock endpoint', async () => {
    const res = await handleUnlockShare(
      new Request('https://example.test/shares/abc/unlock', {
        method: 'POST',
        body: JSON.stringify({ passcode: '123456' }),
      }),
      envWithShareRow({ ...expiredShare, passcode_hash: 'x' }),
      'abc',
    )
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({
      error: 'share_expired',
      message: SHARE_EXPIRED_MESSAGE,
    })
  })
})
