/**
 * Public-share endpoints — `huozi.app/p/<slug>` support.
 *
 * Design (live-mode):
 *   - Shares live in the Worker's D1, not in huozi.app's Supabase. Both Cloud
 *     and Edge editions get shares from the same storage layer.
 *   - A share BINDS a (workspace_id, file_path, slug) triple. On every read
 *     we resolve the CURRENT `blob_sha` from `files_current` and serve that.
 *     → Editing the source file makes subsequent visits show the new bytes.
 *     → Deleting the source file makes the URL return `file_no_longer_exists`.
 *   - The row still records `blob_sha` / `commit_sha` at publish time as
 *     *audit metadata*, not as the authoritative read pointer.
 *   - Passcode: optional 6-digit code, SHA-256 hashed. Anonymous GET on a
 *     locked share returns only the locked stub; POST /unlock trades the
 *     code for content.
 *   - Slug: user can supply a custom `slug` (3-40 chars, a-z0-9-, unique)
 *     or leave it unset and we generate a 10-char random one.
 *
 * Routes:
 *   - `POST /shares`               (Bearer)  create + return { slug, url }
 *   - `GET  /shares/:slug`         (public)  metadata + (if no passcode) content
 *   - `POST /shares/:slug/unlock`  (public)  { passcode } → content
 *   - `GET  /shares`               (Bearer)  list owner's shares
 *   - `POST /shares/:slug/revoke`  (Bearer)  mark revoked
 */

import type { HuoziCloudflareBindings } from './bindings.js'
import { resolveBearer } from './auth.js'
import { canAccess } from './folder-acl.js'
import { blobKey } from './sha.js'
import { sha256Hex } from './sha.js'

/** Accepted form for both generated and user-supplied slugs. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
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
  expires_at: number | null
  view_count: number
  created_by: string
}

/** Upper bound on TTL in seconds. 10 years; callers pass a discrete choice. */
const MAX_TTL_SECONDS = 10 * 365 * 24 * 60 * 60

function normalizeTtlSeconds(raw: unknown): number | null | 'invalid' {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'invalid'
  if (raw <= 0) return null
  if (raw > MAX_TTL_SECONDS) return 'invalid'
  return Math.floor(raw)
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
 *
 * Live-mode semantics: `blob_sha` / `commit_sha` here reflect *the
 * current version at read time*, NOT what was published. If the source
 * file has been edited since publishing, these move to track latest.
 */
interface ShareContent {
  file_path: string
  mime_type: string
  /** Current blob_sha at read time (live-mode). */
  blob_sha: string
  /** Latest commit that touched the path (provenance). */
  commit_sha: string
  size: number
  text?: string
  /** base64-encoded bytes, only present for binaries. */
  binary_base64?: string
}

async function buildShareContent(
  env: HuoziCloudflareBindings,
  row: ShareRow,
): Promise<
  | { ok: true; content: ShareContent }
  | { ok: false; reason: 'file_gone' | 'blob_missing' }
> {
  // Live lookup — resolve the current blob_sha for this file path.
  const current = await currentBlobForPath(env, row.workspace_id, row.file_path)
  if (!current) {
    return { ok: false, reason: 'file_gone' }
  }
  const blob = await fetchBlobContent(env, current.blob_sha)
  if (!blob) {
    return { ok: false, reason: 'blob_missing' }
  }
  const mime = detectTextMime(row.file_path)
  let text: string | undefined
  if (mime.startsWith('text/') || mime === 'application/json') {
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(blob.bytes)
    } catch {
      text = undefined
    }
  }
  return {
    ok: true,
    content: {
      file_path: row.file_path,
      mime_type: mime,
      blob_sha: current.blob_sha,
      commit_sha: current.commit_sha ?? '',
      size: blob.size,
      ...(text !== undefined
        ? { text }
        : { binary_base64: bytesToBase64(blob.bytes) }),
    },
  }
}

// ── Core creation logic (reusable by HTTP + MCP tool) ──────────────────

export interface CreateShareInput {
  /** File path as the caller sees it (scope-relative if scoped). */
  file_path: string
  /** Optional 6-digit passcode. */
  passcode?: string
  /** Optional TTL in seconds. Omit / null / 0 = never expires. */
  expires_in_seconds?: number | null
}

export interface CreateSharePrincipal {
  workspaceId: string
  principalId: string
  scopePath: string | null
}

export type CreateShareResult =
  | {
      ok: true
      slug: string
      file_path: string
      blob_sha: string
      commit_sha: string | null
      has_passcode: boolean
      created_at: number
      expires_at: number | null
    }
  | {
      ok: false
      error:
        | 'invalid_file_path'
        | 'invalid_passcode'
        | 'invalid_ttl'
        | 'file_not_found'
        | 'insert_failed'
      message?: string
    }

/**
 * Core share-creation logic. Used by both the HTTP /shares endpoint and
 * the `huozi_share` MCP tool. Keeps scope handling, slug validation,
 * collision retry, and INSERT in one place.
 */
export async function createShareRow(
  env: HuoziCloudflareBindings,
  principal: CreateSharePrincipal,
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const filePath = (input.file_path ?? '').trim()
  if (!filePath || filePath.length > PATH_MAX) {
    return { ok: false, error: 'invalid_file_path' }
  }

  // Apply scope prefix — shares are stored with absolute path even
  // when the caller sees a scope-relative one.
  const absolutePath = principal.scopePath
    ? principal.scopePath + '/' + filePath.replace(/^\/+/, '')
    : filePath

  const current = await currentBlobForPath(env, principal.workspaceId, absolutePath)
  if (!current) {
    return { ok: false, error: 'file_not_found', message: filePath }
  }

  // Validate passcode if supplied.
  let passcodeHash: string | null = null
  if (
    input.passcode !== undefined &&
    input.passcode !== null &&
    input.passcode !== ''
  ) {
    const pc = validPasscode(input.passcode)
    if (!pc) {
      return {
        ok: false,
        error: 'invalid_passcode',
        message: 'passcode must be exactly 6 digits (0–9).',
      }
    }
    passcodeHash = await sha256Hex(pc)
  }

  // Validate TTL. undefined / null / 0 → never expires.
  const ttl = normalizeTtlSeconds(input.expires_in_seconds)
  if (ttl === 'invalid') {
    return {
      ok: false,
      error: 'invalid_ttl',
      message: `expires_in_seconds must be a positive number ≤ ${MAX_TTL_SECONDS}.`,
    }
  }

  // Slugs are always server-generated now. 10-char random alphabet
  // gives ~8e14 combinations — collisions are astronomically rare, but
  // we keep the retry loop so a lucky duplicate doesn't fail the insert.
  let slug = generateSlug()
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await env.DB.prepare('SELECT slug FROM shares WHERE slug = ?')
      .bind(slug)
      .first()
    if (!existing) break
    slug = generateSlug()
  }

  const now = Date.now()
  const expiresAt = ttl === null ? null : now + ttl * 1000
  try {
    await env.DB.prepare(
      `INSERT INTO shares
       (slug, workspace_id, file_path, blob_sha, commit_sha, passcode_hash, created_at, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        slug,
        principal.workspaceId,
        absolutePath,
        current.blob_sha,
        current.commit_sha ?? '',
        passcodeHash,
        now,
        expiresAt,
        principal.principalId,
      )
      .run()
  } catch (err) {
    // UNIQUE slug is the likely cause under racing inserts.
    return {
      ok: false,
      error: 'insert_failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  return {
    ok: true,
    slug,
    file_path: filePath,
    blob_sha: current.blob_sha,
    commit_sha: current.commit_sha ?? null,
    has_passcode: passcodeHash !== null,
    created_at: now,
    expires_at: expiresAt,
  }
}

// ── POST /shares (create) ───────────────────────────────────────────────

interface CreateShareBody {
  file_path?: string
  passcode?: string
  expires_in_seconds?: number | null
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

  const res = await createShareRow(
    env,
    {
      workspaceId: p.workspaceId,
      principalId: p.principalId,
      scopePath: p.scopePath,
    },
    {
      file_path: body.file_path ?? '',
      passcode: body.passcode,
      expires_in_seconds: body.expires_in_seconds,
    },
  )

  if (!res.ok) {
    const status =
      res.error === 'file_not_found'
        ? 404
        : res.error === 'insert_failed'
          ? 500
          : 400
    return Response.json(
      { error: res.error, message: res.message },
      { status },
    )
  }
  return Response.json({
    ok: true,
    slug: res.slug,
    file_path: res.file_path,
    blob_sha: res.blob_sha,
    commit_sha: res.commit_sha,
    has_passcode: res.has_passcode,
    created_at: res.created_at,
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
    `SELECT * FROM shares
     WHERE slug = ?
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`,
  )
    .bind(slug, Date.now())
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

  const res = await buildShareContent(env, row)
  if (!res.ok) {
    return Response.json(
      {
        error:
          res.reason === 'file_gone' ? 'file_no_longer_exists' : 'content_missing',
        slug,
      },
      { status: 410 },
    )
  }
  return Response.json({
    ok: true,
    slug,
    has_passcode: false,
    locked: false,
    created_at: row.created_at,
    ...res.content,
  })
}

// ── GET /shares/:slug/asset/:path (public, asset proxy) ─────────────────

/**
 * Stream an asset file from the share's workspace. Used by the public
 * `/p/<slug>` renderer to resolve in-markdown image references like
 * `/__assets__/foo.png` without exposing the workspace directly.
 *
 * Security model:
 *   - The share itself must be public (no passcode_hash) and unrevoked.
 *     Locked shares don't proxy assets (the embedded markdown is hidden,
 *     so its assets stay hidden too).
 *   - The asset path is workspace-scoped (looked up via files_current),
 *     so traversal is bounded by D1's exact-path index.
 *   - Asset MUST live under `/__assets__/`. We don't proxy arbitrary
 *     workspace files through this endpoint — that would amount to a
 *     "everything in the workspace is public if any file is shared" leak.
 */
export async function handleGetShareAsset(
  request: Request,
  env: HuoziCloudflareBindings,
  slug: string,
  assetPath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: 'bad_slug' }, { status: 400 })
  }
  // Hard guard: must be under /__assets__/ (workspace-relative). The
  // path arrives from the regex capture group already without a leading
  // slash, so we check the prefix directly.
  if (!assetPath.startsWith('__assets__/') || assetPath.includes('..')) {
    return Response.json({ error: 'bad_asset_path' }, { status: 400 })
  }
  const row = await env.DB.prepare(
    `SELECT * FROM shares
     WHERE slug = ?
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`,
  )
    .bind(slug, Date.now())
    .first<ShareRow>()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (row.passcode_hash) {
    return Response.json({ error: 'locked' }, { status: 403 })
  }

  // Look up the asset in the same workspace as the share.
  const current = await currentBlobForPath(env, row.workspace_id, assetPath)
  if (!current) {
    return Response.json({ error: 'asset_not_found' }, { status: 404 })
  }
  const blob = await fetchBlobContent(env, current.blob_sha)
  if (!blob) {
    return Response.json({ error: 'blob_missing' }, { status: 410 })
  }

  // Pull stored content_type from D1 (set by huozi_upload /
  // huozi_image_render); fall back to extension detection for older rows.
  const contentRow = await env.DB.prepare(
    'SELECT content_type FROM files_current WHERE workspace_id = ? AND path = ?',
  )
    .bind(row.workspace_id, assetPath)
    .first<{ content_type: string | null }>()
  const contentType = contentRow?.content_type ?? guessAssetMime(assetPath)

  // Cast Uint8Array to BodyInit-friendly view; Response accepts ArrayBuffer
  // but the @cloudflare/workers-types build of Uint8Array is occasionally
  // narrower than DOM's. `.buffer` is always BodyInit-compatible.
  const body =
    request.method === 'HEAD'
      ? null
      : (blob.bytes.buffer as ArrayBuffer)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Content-addressed bytes; a given URL always returns the same
      // bytes, so cache aggressively. If the markdown re-publishes
      // pointing at a new sha, the URL pattern itself doesn't change
      // (still `/__assets__/foo.png`) but the resolved blob does — the
      // proxy is the indirection. 1h is conservative; can be raised
      // once we add ETag from blob_sha.
      'Content-Length': String(blob.size),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${current.blob_sha}"`,
    },
  })
}

// ── GET /me/asset/__assets__/:path (Bearer-auth, workspace asset proxy) ─

/**
 * Authenticated sibling of `handleGetShareAsset`: serves an asset from the
 * caller's own workspace. Used by the Web UI's `/workspace/view` renderer
 * so an HTML or markdown file can `<link>` / `<script>` / `<img>` against
 * `/__assets__/<path>` exactly the way `/p/<slug>` shares do, but resolved
 * through the user's session instead of a public share row.
 *
 * Security model:
 *   - Bearer-auth via `api_keys`. Identifies workspace + principal.
 *   - Path MUST live under `/__assets__/` — same hard guard as the share
 *     endpoint so we never become a "GET arbitrary workspace file" tunnel.
 *   - Honors folder ACLs (same `canAccess` check the read tool uses), so
 *     a scoped key can only fetch assets it would also be allowed to
 *     huozi_read.
 *   - `Cache-Control: private` — bytes are user-scoped; no shared CDN
 *     caching across users on the same edge.
 */
export async function handleGetWorkspaceAsset(
  request: Request,
  env: HuoziCloudflareBindings,
  assetPath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!assetPath.startsWith('__assets__/') || assetPath.includes('..')) {
    return Response.json({ error: 'bad_asset_path' }, { status: 400 })
  }

  const auth = await resolveBearer(request.headers.get('Authorization'), env)
  if (!auth.ok) {
    return Response.json(
      { error: auth.failure.message },
      { status: auth.failure.status },
    )
  }

  const access = await canAccess(
    env,
    auth.principal.workspaceId,
    assetPath,
    auth.principal.principalId,
  )
  if (!access.allow) {
    return Response.json({ error: 'acl_denied' }, { status: 403 })
  }

  const current = await currentBlobForPath(
    env,
    auth.principal.workspaceId,
    assetPath,
  )
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
    .bind(auth.principal.workspaceId, assetPath)
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
      // Per-user content; CDN edges must not share across sessions.
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${current.blob_sha}"`,
    },
  })
}

function guessAssetMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    // Images
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
    // Web docs / styling / scripting — needed for HTML pages that reference
    // workspace assets via <link>, <script>, etc.
    case 'css':
      return 'text/css; charset=utf-8'
    case 'js':
    case 'mjs':
      return 'text/javascript; charset=utf-8'
    case 'json':
      return 'application/json; charset=utf-8'
    case 'map':
      return 'application/json; charset=utf-8'
    // Fonts
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
    // Media
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    // Misc text
    case 'txt':
      return 'text/plain; charset=utf-8'
    case 'xml':
      return 'application/xml; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
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
    `SELECT * FROM shares
     WHERE slug = ?
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`,
  )
    .bind(slug, Date.now())
    .first<ShareRow>()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (!row.passcode_hash) {
    // Already public — client shouldn't reach here, but behave gracefully.
    const pub = await buildShareContent(env, row)
    if (!pub.ok) {
      return Response.json(
        {
          error:
            pub.reason === 'file_gone' ? 'file_no_longer_exists' : 'content_missing',
        },
        { status: 410 },
      )
    }
    return Response.json({
      ok: true,
      slug,
      has_passcode: false,
      locked: false,
      created_at: row.created_at,
      ...pub.content,
    })
  }

  const providedHash = await sha256Hex(pc)
  if (providedHash !== row.passcode_hash) {
    return Response.json({ error: 'wrong_passcode' }, { status: 403 })
  }

  const unlocked = await buildShareContent(env, row)
  if (!unlocked.ok) {
    return Response.json(
      {
        error:
          unlocked.reason === 'file_gone'
            ? 'file_no_longer_exists'
            : 'content_missing',
      },
      { status: 410 },
    )
  }
  return Response.json({
    ok: true,
    slug,
    has_passcode: true,
    locked: false,
    created_at: row.created_at,
    ...unlocked.content,
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
            revoked_at, expires_at, view_count
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
    expires_at: r.expires_at,
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

// ── GET /shares/:slug/data/:path (public, declared-include data proxy) ──

/**
 * Sibling-file data proxy for `/p/<slug>` HTML shares. Lets a published
 * HTML page fetch its own data sources (Collection jsonl, csv, json, …)
 * without bundling them inline.
 *
 * Author opts in via a meta tag inside the shared HTML:
 *
 *   <meta name="huozi:share-include" content="threads.jsonl,retros.jsonl">
 *
 * Each listed path is resolved RELATIVE to the share file's directory
 * (so `dev/board.html` declaring `threads.jsonl` exposes
 * `dev/threads.jsonl`). Only files in the include list are reachable
 * through this endpoint — anything else returns 403. This keeps the
 * "publish one file" mental model intact and avoids the
 * "everything's public if any file is shared" leak called out in the
 * asset proxy comments.
 *
 * Routes here mirror the asset proxy's security stance:
 *   - revoked / expired share → 404
 *   - passcode-locked share   → 403 (data follows the lock; you can't
 *                                    unlock data separately from the page)
 *   - path with `..`          → 400
 *   - path not in include list → 403
 */
export async function handleGetShareData(
  request: Request,
  env: HuoziCloudflareBindings,
  slug: string,
  dataPath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: 'bad_slug' }, { status: 400 })
  }
  if (!dataPath || dataPath.includes('..') || dataPath.startsWith('/')) {
    return Response.json({ error: 'bad_data_path' }, { status: 400 })
  }
  const row = await env.DB.prepare(
    `SELECT * FROM shares
     WHERE slug = ?
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`,
  )
    .bind(slug, Date.now())
    .first<ShareRow>()
  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (row.passcode_hash) {
    return Response.json({ error: 'locked' }, { status: 403 })
  }

  // Load the share's main file bytes to extract the include allowlist.
  // This is the same blob the public share endpoint serves — at most
  // one extra fetch per data request, acceptable for MVP without a
  // separate include-list column in `shares`.
  const main = await currentBlobForPath(env, row.workspace_id, row.file_path)
  if (!main) {
    return Response.json({ error: 'file_no_longer_exists' }, { status: 410 })
  }
  const mainBlob = await fetchBlobContent(env, main.blob_sha)
  if (!mainBlob) {
    return Response.json({ error: 'content_missing' }, { status: 410 })
  }
  const mainText = new TextDecoder('utf-8', { fatal: false }).decode(
    mainBlob.bytes,
  )
  const includeList = parseShareIncludeMeta(mainText)
  if (!includeList.includes(dataPath)) {
    return Response.json({ error: 'not_in_include_list' }, { status: 403 })
  }

  // Resolve dataPath relative to the share file's directory.
  const sharedDir = dirname(row.file_path)
  const absolutePath = sharedDir ? sharedDir + '/' + dataPath : dataPath

  const current = await currentBlobForPath(env, row.workspace_id, absolutePath)
  if (!current) {
    return Response.json({ error: 'data_not_found' }, { status: 404 })
  }
  const blob = await fetchBlobContent(env, current.blob_sha)
  if (!blob) {
    return Response.json({ error: 'blob_missing' }, { status: 410 })
  }

  const contentType = guessDataMime(absolutePath)
  const body =
    request.method === 'HEAD' ? null : (blob.bytes.buffer as ArrayBuffer)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(blob.size),
      // Live-mode contract: revalidate every request so HTML pages see
      // the latest data without hard-refresh. Bytes are still cacheable
      // by ETag (sha-derived) for unchanged blobs.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${current.blob_sha}"`,
    },
  })
}

/**
 * Parse the `huozi:share-include` meta tag from a shared HTML file.
 * Returns the comma-separated list of allowed sibling paths. Empty when
 * absent, malformed, or empty.
 *
 *   <meta name="huozi:share-include" content="a.jsonl,sub/b.csv">
 */
function parseShareIncludeMeta(html: string): string[] {
  const m = html.match(
    /<meta\s+[^>]*?\bname\s*=\s*["']huozi:share-include["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']/i,
  )
  if (!m) return []
  return m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/**
 * MIME map for files served through the share-include data proxy.
 * Targets the data formats authors are likely to embed: jsonl
 * (Collection), csv/tsv (Table), json. Everything else falls back to
 * `application/octet-stream` — the page can still fetch it as bytes,
 * but the browser won't pretend it knows the shape.
 */
function guessDataMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'jsonl':
    case 'ndjson':
      return 'application/x-ndjson; charset=utf-8'
    case 'json':
      return 'application/json; charset=utf-8'
    case 'csv':
      return 'text/csv; charset=utf-8'
    case 'tsv':
      return 'text/tab-separated-values; charset=utf-8'
    case 'txt':
    case 'md':
      return 'text/plain; charset=utf-8'
    case 'xml':
      return 'application/xml; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}
