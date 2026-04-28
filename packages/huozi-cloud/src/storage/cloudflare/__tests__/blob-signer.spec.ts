import { describe, expect, it } from 'vitest'
import { createBlobSigner, verifyBlobUrl } from '../blob-signer.js'

const SECRET = 'test-signing-secret-do-not-use-in-prod'
const ORIGIN = 'https://example.test'

function makeRequest(url: string): Request {
  return new Request(url)
}

describe('blob-signer — round-trip', () => {
  it('signs then verifies a fresh URL', async () => {
    const sign = createBlobSigner({ origin: ORIGIN, secret: SECRET })!
    const out = await sign({
      workspaceId: 'ws_demo',
      path: 'reports/q1.pdf',
      blob_sha: 'a'.repeat(40),
    })
    expect(out.url).toMatch(/^https:\/\/example\.test\/blobs\/[0-9a-f]{40}/)

    const verified = await verifyBlobUrl(makeRequest(out.url), SECRET)
    expect(verified).not.toBeNull()
    expect(verified?.workspaceId).toBe('ws_demo')
    expect(verified?.path).toBe('reports/q1.pdf')
  })

  it('rejects a tampered token', async () => {
    const sign = createBlobSigner({ origin: ORIGIN, secret: SECRET })!
    const out = await sign({
      workspaceId: 'ws_demo',
      path: 'a.txt',
      blob_sha: 'b'.repeat(40),
    })
    const tampered = out.url.replace(/token=[^&]+/, 'token=AAAA')
    const verified = await verifyBlobUrl(makeRequest(tampered), SECRET)
    expect(verified).toBeNull()
  })

  it('rejects a path swap (signature was bound to original path)', async () => {
    const sign = createBlobSigner({ origin: ORIGIN, secret: SECRET })!
    const out = await sign({
      workspaceId: 'ws_demo',
      path: 'public/safe.txt',
      blob_sha: 'c'.repeat(40),
    })
    const swapped = out.url.replace(
      'path=public%2Fsafe.txt',
      'path=secrets%2Fkeys.json',
    )
    const verified = await verifyBlobUrl(makeRequest(swapped), SECRET)
    expect(verified).toBeNull()
  })

  it('rejects an expired URL', async () => {
    const sign = createBlobSigner({ origin: ORIGIN, secret: SECRET })!
    const out = await sign({
      workspaceId: 'ws_demo',
      path: 'a.txt',
      blob_sha: 'd'.repeat(40),
      ttlSeconds: 1,
    })
    // Force exp into the past.
    const past = out.url.replace(/exp=\d+/, `exp=${Date.now() - 1000}`)
    const verified = await verifyBlobUrl(makeRequest(past), SECRET)
    expect(verified).toBeNull()
  })

  it('returns null when no secret is configured', async () => {
    const sign = createBlobSigner({ origin: ORIGIN, secret: undefined })
    expect(sign).toBeNull()

    // verify also no-ops without a secret.
    const v = await verifyBlobUrl(
      makeRequest(`${ORIGIN}/blobs/${'e'.repeat(40)}?token=x&exp=1&ws=w&path=p`),
      undefined,
    )
    expect(v).toBeNull()
  })
})
