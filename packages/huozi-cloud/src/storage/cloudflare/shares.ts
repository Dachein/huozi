/**
 * Public-share endpoints — `huozi.app/p/<slug>` support.
 *
 * Design:
 *   - Shares live in the Worker's D1, not in huozi.app's Supabase. This means
 *     both Cloud and Edge editions get shares for free and the storage layer
 *     stays single-source-of-truth.
 *   - A share pins an immutable `blob_sha` at publish time. Later edits to
 *     the source file create new blobs and new commits; the share keeps
 *     serving the frozen bytes because R2 objects are content-addressed.
 *   - Passcode is optional. When set, it's a 6-digit numeric code stored as
 *     a SHA-256 hash. Anonymous visitors hit `GET /shares/:slug` and get a
 *     `{ has_passcode: true }` stub; they then POST `/shares/:slug/unlock`
 *     with the code to retrieve the content.
 *
 * Routes:
 *   - `POST /shares`                        (Bearer) create + return { slug, url }
 *   - `GET  /shares/:slug`                  (public) metadata + (if no passcode) content
 *   - `POST /shares/:slug/unlock`           (public) { passcode } → content
 *   - `GET  /shares` (list, Bearer)         (Bearer) all shares the caller owns
 *   - `POST /shares/:slug/revoke`           (Bearer) mark revoked
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'
import { blobKey } from './sha.js'
import { sha256Hex } from './sha.js'

const SLUG_RE = /^[a-z0-9]{6,24}$/
const PATH_MAX = 1024

/** Short base32-ish alphabet (no 0/O/1/l to reduce mistype). */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateSlug(len = 10): string {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  let s = ''
  for (let i = 0; i < len; i++) {
    s += SLUG_ALPHABET[buf[i]! % SLUG_ALPHABET.length]
  }
  return s
}

function validPasscode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!/^\d{6}$/.test(raw)) return null
  return raw
}

interface ShareRow {
  slug: string
  workspace_id: string
  file_path: string
  blob_sha: string
  commit_sha: string
  passcode_hash: string | null
  created_at: number
  revoked_at: number | null
  view_count: number
  created_by: string
}

// ── Internal helpers ────────────────────────────────────────────────────

async function currentBlobForPath(
  env: HuoziCloudflareBindings,
  workspaceId: string,
  filePath: string,
): Promise<{ blob_sha: string; commit_sha: string | null } | null> {
  const row = await env.DB.prepare(
    'SELECT blob_sha FROM files_current WHERE workspace_id = ? AND path = ?',
  )
    .bind(workspaceId, filePath)
    .first<{ blob_sha: string }>()
  if (!row) return null
  // Grab the most recent commit that touched this path (for provenance).
  const commit = await env.DB.prepare(
    `SELECT commit_sha FROM commit_paths
     WHERE workspace_id = ? AND path = ?
     ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(workspaceId, filePath)
    .first<{ commit_sha: string }>()
  return { blob_sha: row.blob_sha, commit_sha: commit?.commit_sha ?? null }
}

async function fetchBlobContent(
  env: HuoziCloudflareBindings,
  blob_sha: string,
): Promise<{ bytes: Uint8Array; size: number } | null> {
  const obj = await env.BLOBS.get(blobKey(blob_sha))
  if (!obj) return null
  const bytes = new Uint8Array(await obj.arrayBuffer())
  return { bytes, size: bytes.length }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

function detectTextMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'md':
    case 'mdx':
      return 'text/markdown'
    case 'html':
    case 'htm':
      return 'text/html'
    case 'json':
      return 'application/json'
    case 'csv':
      return 'text/csv'
    case 'tsv':
      return 'text/tab-separated-values'
    case 'txt':
      return 'text/plain'
    default:
      return 'text/plain'
  }
}

/**
 * Payload returned to an unlocked viewer. UTF-8 decoded when possible;
 * binaries come back base64.
 */
interface ShareContent {
  file_path: string
  mime_type: string
  blob_sha: string
  commit_sha: string
  size: number
  text?: string
  /** base64-encoded bytes, only present for binaries. */
  binary_base64?: string
}

async function buildShareContent(
  env: HuoziCloudflareBindings,
  row: ShareRow,
): Promise<ShareContent | null> {
  const blob = await fetchBlobContent(env, row.blob_sha)
  if (!blob) return null
  const mime = detectTextMime(row.file_path)
  let text: string | undefined
  // Try UTF-8 decode for anything looking textual.
  if (mime.startsWith('text/') || mime === 'application/json') {
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(blob.bytes)
    } catch {
      text = undefined
    }
  }
  return {
    file_path: row.file_path,
    mime_type: mime,
    blob_sha: row.blob_sha,
    commit_sha: row.commit_sha,
    size: blob.size,
    ...(text !== undefined
      ? { text }
      : { binary_base64: bytesToBase64(blob.bytes) }),
  }
}

// ── POST /shares (create) ───────────────────────────────────────────────

interface CreateShareBody {
  file_path?: string
  passcode?: string
}

export async function handleCreateShare(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  const p = auth.principal

  let body: CreateShareBody
  try {
    body = (await request.json()) as CreateShareBody
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const filePath = (body.file_path ?? '').trim()
  if (!filePath || filePath.length > PATH_MAX) {
    return Response.json({ error: 'invalid_file_path' }, { status: 400 })
  }

  // Apply scope prefix (mirror the MCP flow — shares are scope-relative from
  // the caller's perspective, but stored with absolute path).
  const absolutePath = p.scopePath
    ? p.scopePath + '/' + filePath.replace(/^\/+/, '')
    : filePath

  const current = await currentBlobForPath(env, p.workspaceId, absolutePath)
  if (!current) {
    return Response.json(
      { error: 'file_not_found', file_path: filePath },
      { status: 404 },
    )
  }

  let passcodeHash: string | null = null
  if (body.passcode !== undefined && body.passcode !== null && body.passcode !== '') {
    const pc = validPasscode(body.passcode)
    if (!pc) {
      return Response.json(
        {
          error: 'invalid_passcode',
          message: 'passcode must be exactly 6 digits (0–9).',
        },
        { status: 400 },
      )
    }
    passcodeHash = await sha256Hex(pc)
  }

  // Collision-retry loop (vanishingly unlikely but cheap).
  let slug = generateSlug()
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await env.DB.prepare('SELECT slug FROM shares WHERE slug = ?')
      .bind(slug)
      .first()
    if (!existing) break
    slug = generateSlug()
  }

  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO shares
     (slug, workspace_id, file_path, blob_sha, commit_sha, passcode_hash, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      slug,
      p.workspaceId,
      absolutePath,
      current.blob_sha,
      current.commit_sha ?? '',
      passcodeHash,
      now,
      p.principalId,
    )
    .run()

  return Response.json({
    ok: true,
    slug,
    file_path: filePath,
    blob_sha: current.blob_sha,
    commit_sha: current.commit_sha,
    has_passcode: passcodeHash !== null,
    created_at: now,
  })
}

// ── GET /shares/:slug (public metadata + content if not locked) ─────────

export async function handleGetShare(
  request: Request,
  env: HuoziCloudflareBindings,
  slug: string,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: 'bad_slug' }, { status: 400 })
  }
  const row = await env.DB.prepare(
    `SELECT * FROM shares WHERE slug = ? AND revoked_at IS NULL`,
  )
    .bind(slug)
    .first<ShareRow>()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  // Best-effort view count increment (don't block response on it).
  env.DB.prepare(`UPDATE shares SET view_count = view_count + 1 WHERE slug = ?`)
    .bind(slug)
    .run()
    .catch(() => {})

  if (row.passcode_hash) {
    return Response.json({
      ok: true,
      slug,
      file_path: row.file_path,
      has_passcode: true,
      locked: true,
      created_at: row.created_at,
    })
  }

  const content = await buildShareContent(env, row)
  if (!content) {
    return Response.json(
      { error: 'content_missing', slug },
      { status: 410 },
    )
  }
  return Response.json({
    ok: true,
    slug,
    has_passcode: false,
    locked: false,
    created_at: row.created_at,
    ...content,
  })
}

// ── POST /shares/:slug/unlock (public, passcode-gated content) ──────────

interface UnlockBody {
  passcode?: string
}

export async function handleUnlockShare(
  request: Request,
  env: HuoziCloudflareBindings,
  slug: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: 'bad_slug' }, { status: 400 })
  }
  let body: UnlockBody
  try {
    body = (await request.json()) as UnlockBody
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const pc = validPasscode(body.passcode)
  if (!pc) {
    return Response.json(
      { error: 'invalid_passcode', message: 'passcode must be 6 digits' },
      { status: 400 },
    )
  }

  const row = await env.DB.prepare(
    `SELECT * FROM shares WHERE slug = ? AND revoked_at IS NULL`,
  )
    .bind(slug)
    .first<ShareRow>()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (!row.passcode_hash) {
    // Already public — client shouldn't reach here, but behave gracefully.
    const content = await buildShareContent(env, row)
    if (!content) {
      return Response.json({ error: 'content_missing' }, { status: 410 })
    }
    return Response.json({
      ok: true,
      slug,
      has_passcode: false,
      locked: false,
      created_at: row.created_at,
      ...content,
    })
  }

  const providedHash = await sha256Hex(pc)
  if (providedHash !== row.passcode_hash) {
    return Response.json({ error: 'wrong_passcode' }, { status: 403 })
  }

  const content = await buildShareContent(env, row)
  if (!content) {
    return Response.json({ error: 'content_missing' }, { status: 410 })
  }
  return Response.json({
    ok: true,
    slug,
    has_passcode: true,
    locked: false,
    created_at: row.created_at,
    ...content,
  })
}

// ── GET /shares  (list owner's shares) ──────────────────────────────────

export async function handleListShares(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  const { results } = await env.DB.prepare(
    `SELECT slug, file_path, blob_sha, commit_sha, passcode_hash, created_at,
            revoked_at, view_count
     FROM shares
     WHERE workspace_id = ?
     ORDER BY created_at DESC
     LIMIT 200`,
  )
    .bind(auth.principal.workspaceId)
    .all<Omit<ShareRow, 'workspace_id' | 'created_by'>>()

  const scope = auth.principal.scopePath
  const mapped = (results ?? []).map((r) => ({
    slug: r.slug,
    file_path: scope ? relativeToScope(r.file_path, scope) : r.file_path,
    blob_sha: r.blob_sha,
    commit_sha: r.commit_sha,
    has_passcode: r.passcode_hash !== null,
    created_at: r.created_at,
    revoked_at: r.revoked_at,
    view_count: r.view_count,
  }))
  return Response.json({ ok: true, shares: mapped })
}

function relativeToScope(path: string, scope: string): string {
  if (path === scope) return '.'
  const prefix = scope + '/'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

// ── POST /shares/:slug/revoke ───────────────────────────────────────────

export async function handleRevokeShare(
  request: Request,
  env: HuoziCloudflareBindings,
  slug: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = await resolveBearer(request.headers.get('authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: 'bad_slug' }, { status: 400 })
  }
  const res = await env.DB.prepare(
    `UPDATE shares SET revoked_at = ?
     WHERE slug = ? AND workspace_id = ? AND revoked_at IS NULL`,
  )
    .bind(Date.now(), slug, auth.principal.workspaceId)
    .run()
  const changes = res.meta?.changes ?? 0
  if (changes === 0) {
    return Response.json(
      { error: 'not_found_or_already_revoked' },
      { status: 404 },
    )
  }
  return Response.json({ ok: true, slug })
}
