/**
 * Short-lived signed URLs for R2 blob downloads.
 *
 * Why this lives at the worker layer (not at R2): R2 supports presigned URLs
 * via its S3 API, but those bind to a bucket key — they can't enforce
 * workspace-scoped permissions. Our blobs are content-addressed by SHA, so
 * a leaked URL would be valid for any caller who knew the SHA. Signing at
 * the worker layer lets us bind the URL to (workspace, path, blob_sha, exp)
 * tuples and tear them down on rotate.
 *
 * URL shape:
 *   GET <origin>/blobs/<blob_sha>?ws=<id>&path=<encoded>&exp=<unix-ms>&token=<base64url>
 *
 * Verifier checks: token == HMAC-SHA256(secret, "<sha>|<ws>|<path>|<exp>")
 * AND now < exp. Mismatch → 403; expired → 410.
 *
 * The verifier does NOT confirm the principal still has read permission on
 * `path` at fetch time. That's by design — the signed URL is ephemeral
 * (default 20 min) and represents a snapshot of "this principal could read
 * this path when the URL was issued". Re-checking ACL on each blob fetch
 * would defeat the streaming property of signed URLs and adds DB round-trips
 * for every chunk a user downloads.
 */

const SIGN_ALGO = { name: 'HMAC', hash: 'SHA-256' } as const

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let s = ''
  for (const b of u8) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(
  secret: string,
  message: string,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    SIGN_ALGO,
    false,
    ['sign', 'verify'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
}

function canonicalMessage(
  workspaceId: string,
  path: string,
  blob_sha: string,
  exp: number,
): string {
  return `${blob_sha}|${workspaceId}|${path}|${exp}`
}

export interface SignedBlobUrl {
  url: string
  expiresAt: number
}

export interface BlobSignerArgs {
  workspaceId: string
  path: string
  blob_sha: string
  ttlSeconds?: number
}

const DEFAULT_TTL_SECONDS = 20 * 60

/**
 * Build a function the tools call to mint signed URLs. Returns null when
 * the secret isn't configured — callers handle that as "downloads not
 * available in this deployment".
 */
export function createBlobSigner(opts: {
  origin: string
  secret: string | undefined
}): ((args: BlobSignerArgs) => Promise<SignedBlobUrl>) | null {
  if (!opts.secret) return null
  const { origin, secret } = opts
  return async (args) => {
    const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS
    const exp = Date.now() + ttl * 1000
    const sig = await hmac(
      secret,
      canonicalMessage(args.workspaceId, args.path, args.blob_sha, exp),
    )
    const token = bytesToBase64Url(sig)
    const url = new URL(`${origin}/blobs/${args.blob_sha}`)
    url.searchParams.set('ws', args.workspaceId)
    url.searchParams.set('path', args.path)
    url.searchParams.set('exp', String(exp))
    url.searchParams.set('token', token)
    return { url: url.toString(), expiresAt: exp }
  }
}

/**
 * Verify a request URL's signature. Returns the parsed args on success,
 * or null on any failure (bad params, bad token, expired). Caller turns
 * null into a 403 / 410.
 */
export async function verifyBlobUrl(
  request: Request,
  secret: string | undefined,
): Promise<{
  workspaceId: string
  path: string
  blob_sha: string
  expiresAt: number
} | null> {
  if (!secret) return null
  const url = new URL(request.url)
  const m = url.pathname.match(/^\/blobs\/([0-9a-f]{40})$/)
  if (!m) return null
  const blob_sha = m[1]!
  const ws = url.searchParams.get('ws')
  const path = url.searchParams.get('path')
  const expRaw = url.searchParams.get('exp')
  const token = url.searchParams.get('token')
  if (!ws || !path || !expRaw || !token) return null
  const exp = Number(expRaw)
  if (!Number.isFinite(exp)) return null
  if (Date.now() > exp) return null

  const expected = await hmac(secret, canonicalMessage(ws, path, blob_sha, exp))
  const expectedB64 = bytesToBase64Url(expected)
  // Constant-time string compare — prevents timing oracles. Length difference
  // is itself a leak only if signatures vary in length; ours are fixed at 32
  // bytes / 43 chars base64url, so a length mismatch = forgery.
  if (token.length !== expectedB64.length) return null
  const a = new TextEncoder().encode(token)
  const b = new TextEncoder().encode(expectedB64)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  if (diff !== 0) return null
  // Re-derive bytes once just to keep the lint quiet — base64UrlToBytes is
  // exported for tests/users that want raw signatures.
  void base64UrlToBytes
  return { workspaceId: ws, path, blob_sha, expiresAt: exp }
}
