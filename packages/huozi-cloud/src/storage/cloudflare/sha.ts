/**
 * Git-compatible blob SHA-1 for Workers.
 *
 * IDENTICAL formula to the in-memory backend's: `blob <size>\0<content>` →
 * SHA-1 hex. That way a blob hashed locally and a blob hashed in the cloud
 * give the same sha — letting us swap backends without invalidating caches.
 */

export async function gitBlobSha1(content: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${content.length}\0`)
  const combined = new Uint8Array(header.length + content.length)
  combined.set(header, 0)
  combined.set(content, header.length)
  const digest = await crypto.subtle.digest('SHA-1', combined)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

/** Convert a Bearer token to the sha256 hex we store in `api_keys.key_hash`. */
export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i++) {
    hex += view[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

/** R2 key for a blob sha, using `blobs/<2-char prefix>/<rest>` layout. */
export function blobKey(sha: string): string {
  return `blobs/${sha.slice(0, 2)}/${sha.slice(2)}`
}
