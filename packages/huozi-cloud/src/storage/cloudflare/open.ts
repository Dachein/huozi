/**
 * HTTP-side handlers for open-token URLs (`/o/<token>`).
 *
 * Endpoints:
 *   - GET  /o/<token>            → JSON envelope with file content; the
 *                                   Next.js `/o/[token]/page.tsx` SSR
 *                                   route calls this server-to-server
 *                                   to fetch bytes before rendering.
 *   - GET|HEAD /o/<token>/data/<path>
 *                                 → sibling-file proxy for the rendered
 *                                   HTML's data sources, mirror of the
 *                                   public `/p/<slug>/data/*` proxy.
 *   - GET|HEAD /o/<token>/asset/__assets__/<path>
 *                                 → token-gated workspace asset proxy for
 *                                   HTML/markdown resources.
 *
 * The JSON envelope mirrors the share-content shape so the same
 * downstream `renderForPath` code path can be reused on the Next.js
 * side without branching on share-vs-open.
 *
 * Token verification:
 *   - HS256 over `HUOZI_AUTH_SECRET`
 *   - issuer must be `'huozi-open'` (refuses cross-family tokens)
 *   - `fp` claim is taken at face value; it was bound at sign time to
 *     the authenticated principal's scope, so no extra ACL check is
 *     needed here (anyone who can sign already had MCP access).
 *
 * Sibling-data grant: the token still binds ONE host file. The data
 * proxy widens reachability only to the siblings that host HTML names
 * in its own `<meta huozi:share-include>` — the allowlist lives in the
 * file, not the token, so editing it takes effect without re-minting.
 */

import { verifyOpenToken } from './open-token.js'
import {
  currentBlobForPath,
  fetchBlobContent,
  serveIncludedSiblingData,
} from './shares.js'
import type { HuoziCloudflareBindings } from './bindings.js'

interface OpenContentResponse {
  ok: true
  file_path: string
  mime_type: string
  size: number
  blob_sha: string
  commit_sha: string
  text?: string
  binary_base64?: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  // btoa is available in Workers/V8 runtime
  return btoa(binary)
}

function detectTextMime(filePath: string): string {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot < 0 ? '' : lower.slice(dot + 1)
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html'
    case 'md':
    case 'mdx':
      return 'text/markdown'
    case 'csv':
      return 'text/csv'
    case 'tsv':
      return 'text/tab-separated-values'
    case 'jsonl':
    case 'json':
      return 'application/json'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

function guessAssetMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    case 'ico':
      return 'image/x-icon'
    case 'css':
      return 'text/css; charset=utf-8'
    case 'js':
    case 'mjs':
      return 'text/javascript; charset=utf-8'
    case 'json':
    case 'map':
      return 'application/json; charset=utf-8'
    case 'woff':
      return 'font/woff'
    case 'woff2':
      return 'font/woff2'
    case 'ttf':
      return 'font/ttf'
    case 'otf':
      return 'font/otf'
    case 'eot':
      return 'application/vnd.ms-fontobject'
    case 'pdf':
      return 'application/pdf'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    default:
      return 'application/octet-stream'
  }
}

export async function handleGetOpen(
  request: Request,
  env: HuoziCloudflareBindings,
  token: string,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const secret = (env as { HUOZI_AUTH_SECRET?: string }).HUOZI_AUTH_SECRET
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: 'misconfigured', message: 'HUOZI_AUTH_SECRET not set' },
      { status: 500 },
    )
  }
  const claims = await verifyOpenToken(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_or_expired' }, { status: 404 })
  }

  // The file_path stored in the token is already scope-resolved at sign
  // time (see worker mintOpenUrl). Treat it as the absolute workspace
  // path; do NOT re-apply scopePath here.
  const workspaceId = claims.sub
  const filePath = claims.fp

  const current = await currentBlobForPath(env, workspaceId, filePath)
  if (!current) {
    return Response.json(
      { error: 'file_no_longer_exists', file_path: filePath },
      { status: 410 },
    )
  }
  const blob = await fetchBlobContent(env, current.blob_sha)
  if (!blob) {
    return Response.json(
      { error: 'content_missing', file_path: filePath },
      { status: 410 },
    )
  }

  const mime = detectTextMime(filePath)
  let text: string | undefined
  if (mime.startsWith('text/') || mime === 'application/json') {
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(blob.bytes)
    } catch {
      text = undefined
    }
  }

  const body: OpenContentResponse = {
    ok: true,
    file_path: filePath,
    mime_type: mime,
    size: blob.size,
    blob_sha: current.blob_sha,
    commit_sha: current.commit_sha ?? '',
    ...(text !== undefined ? { text } : { binary_base64: bytesToBase64(blob.bytes) }),
  }
  return Response.json(body, {
    // The bytes are tied to a short-lived token; intermediaries should
    // not cache lest a stale rendering leak after the token's exp.
    headers: { 'Cache-Control': 'no-store' },
  })
}

/**
 * GET|HEAD /o/<token>/data/<path> — sibling-file proxy for open-token
 * HTML renders. Mirror of the public `/p/<slug>/data/*` proxy, but the
 * host file is authorized by the token's `fp` claim instead of a share
 * row. The HTML's own `<meta huozi:share-include>` remains the
 * allowlist — only siblings it explicitly named are reachable; the
 * token does NOT widen access to the rest of the workspace.
 *
 * Served `no-store` (vs the public proxy's edge-revalidate): the URL
 * carries the short-lived token, so neither browsers nor intermediaries
 * should retain the bytes past its exp.
 */
export async function handleGetOpenData(
  request: Request,
  env: HuoziCloudflareBindings,
  token: string,
  dataPath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }
  const secret = (env as { HUOZI_AUTH_SECRET?: string }).HUOZI_AUTH_SECRET
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: 'misconfigured', message: 'HUOZI_AUTH_SECRET not set' },
      { status: 500 },
    )
  }
  const claims = await verifyOpenToken(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_or_expired' }, { status: 404 })
  }
  // claims.fp is the scope-resolved host path bound at sign time — the
  // same value handleGetOpen renders. Siblings resolve relative to it.
  return serveIncludedSiblingData(
    env,
    claims.sub,
    claims.fp,
    dataPath,
    request.method as 'GET' | 'HEAD',
    'no-store',
  )
}

/**
 * GET|HEAD /o/<token>/asset/__assets__/<path> — private asset proxy for
 * open-token renders. Mirrors `/shares/<slug>/asset/*` but uses the token's
 * workspace id instead of a public share row and always serves `no-store`.
 */
export async function handleGetOpenAsset(
  request: Request,
  env: HuoziCloudflareBindings,
  token: string,
  assetPath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }
  const secret = (env as { HUOZI_AUTH_SECRET?: string }).HUOZI_AUTH_SECRET
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: 'misconfigured', message: 'HUOZI_AUTH_SECRET not set' },
      { status: 500 },
    )
  }
  const claims = await verifyOpenToken(secret, token)
  if (!claims) {
    return Response.json({ error: 'invalid_or_expired' }, { status: 404 })
  }
  if (!assetPath.startsWith('__assets__/') || assetPath.includes('..')) {
    return Response.json({ error: 'bad_asset_path' }, { status: 400 })
  }

  const current = await currentBlobForPath(env, claims.sub, assetPath)
  if (!current) {
    return Response.json({ error: 'asset_not_found' }, { status: 404 })
  }
  const blob = await fetchBlobContent(env, current.blob_sha)
  if (!blob) {
    return Response.json({ error: 'blob_missing' }, { status: 410 })
  }
  const contentRow = await env.DB.prepare(
    'SELECT content_type FROM files_current WHERE workspace_id = ? AND path = ?',
  )
    .bind(claims.sub, assetPath)
    .first<{ content_type: string | null }>()
  const contentType = contentRow?.content_type ?? guessAssetMime(assetPath)
  const body =
    request.method === 'HEAD'
      ? null
      : (blob.bytes.buffer as ArrayBuffer)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(blob.size),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${current.blob_sha}"`,
    },
  })
}
