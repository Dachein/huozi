/**
 * R2 garbage collection for orphan blobs.
 *
 * Content-addressed storage means R2 blobs aren't deleted when D1 metadata
 * goes away (huozi_rm, workspace deletion, etc.) — RmTool documents this
 * intentional skew. This sweep walks R2 under the `blobs/` prefix and
 * deletes any object whose sha is no longer referenced by `files_current`
 * or `commit_paths` in D1.
 *
 * Two triggers expected:
 *   - Weekly Cron Trigger via wrangler.toml [triggers] crons
 *   - Manual `POST /admin/gc-blobs?dry_run=1` for ad-hoc runs
 *
 * Safety: candidates uploaded within MIN_AGE_MS of "now" are skipped.
 * huozi_write does R2.put before D1 commit; without this grace window
 * the GC could delete a blob whose D1 row hasn't landed yet.
 */
import { assertAdminAuth, type AdminEnv } from './admin.js'

const MIN_AGE_MS = 24 * 60 * 60 * 1000
const R2_PAGE = 1000

export interface GcResult {
  scanned: number
  kept: number
  deleted: number
  skipped_recent: number
  failed: number
  duration_ms: number
  dry_run: boolean
}

export async function gcOrphanBlobs(
  env: { BLOBS: R2Bucket; DB: D1Database },
  opts: { dryRun?: boolean; minAgeMs?: number } = {},
): Promise<GcResult> {
  const t0 = Date.now()
  const dryRun = opts.dryRun === true
  const cutoff = Date.now() - (opts.minAgeMs ?? MIN_AGE_MS)

  const live = new Set<string>()
  const live_q = await env.DB.prepare(
    `SELECT DISTINCT blob_sha AS sha FROM files_current WHERE blob_sha IS NOT NULL
     UNION SELECT DISTINCT before_blob_sha FROM commit_paths WHERE before_blob_sha IS NOT NULL
     UNION SELECT DISTINCT after_blob_sha  FROM commit_paths WHERE after_blob_sha  IS NOT NULL`,
  ).all<{ sha: string }>()
  for (const row of live_q.results) live.add(row.sha)

  let scanned = 0
  let kept = 0
  let deleted = 0
  let skipped_recent = 0
  let failed = 0
  let cursor: string | undefined
  do {
    const page = await env.BLOBS.list({ prefix: 'blobs/', cursor, limit: R2_PAGE })
    for (const obj of page.objects) {
      scanned++
      const sha = obj.key.replace(/^blobs\//, '').replace('/', '')
      if (live.has(sha)) {
        kept++
        continue
      }
      if (obj.uploaded.getTime() > cutoff) {
        skipped_recent++
        continue
      }
      if (dryRun) {
        deleted++
        continue
      }
      try {
        await env.BLOBS.delete(obj.key)
        deleted++
      } catch {
        failed++
      }
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return {
    scanned,
    kept,
    deleted,
    skipped_recent,
    failed,
    duration_ms: Date.now() - t0,
    dry_run: dryRun,
  }
}

export async function handleGcBlobs(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') === '1'
  const result = await gcOrphanBlobs(env, { dryRun })
  return Response.json({ ok: true, ...result })
}
