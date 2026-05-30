/**
 * POST /api/app/drive/edit  { file_path, old_string, new_string, replace_all? }
 *
 * Inline-edit carve-out for the Web UI. Powers the "select text → Edit"
 * affordance on the workspace view page.
 *
 * Architectural note: like `/api/app/assets/delete`, this is a deliberate,
 * scoped exception to "Web is read-only". The carve-out:
 *   - goes through the standard `huozi_edit` MCP tool, so the Worker's audit
 *     log records the change with `author_type = 'user'` exactly like an
 *     Agent-initiated edit;
 *   - relies on Worker-side capability + folder-ACL checks (no extra Next-side
 *     gate); the Web UI's only job is to make the read→edit round-trip work
 *     in two HTTP requests by routing both through the same session DO
 *     (`cloudReadForEdit` + `cloudEdit` opt INTO the session — they omit the
 *     X-Huozi-No-Session header that all other Web SSR calls set).
 *
 * Errors are mapped from the MCP errorCode → an HTTP status the client can
 * use to render a friendly toast (stale, not-found, ambiguous, etc.).
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import {
  HUOZI_CLOUD_KEY_COOKIE,
  cloudEdit,
  cloudReadForEdit,
  type McpResult,
} from '@/lib/drive/mcp-client'
import {
  shellCacheKey,
  invalidateShellCache,
} from '@/app/(app)/workspace/(shell)/_shell-data'

interface EditBody {
  file_path?: unknown
  old_string?: unknown
  new_string?: unknown
  replace_all?: unknown
  /** Blob_sha the client observed out-of-band (page SSR). When present,
   *  the route skips the Read-first round-trip and goes straight to
   *  huozi_edit — the Worker uses parent_blob_sha as the freshness
   *  proof. Halves perceived save latency. */
  parent_blob_sha?: unknown
}

const MAX_STRING_BYTES = 200_000

function isReasonableString(v: unknown, maxBytes: number): v is string {
  return typeof v === 'string' && v.length <= maxBytes
}

function statusFor(code: number): number {
  switch (code) {
    case 4: // FILE_NOT_FOUND
      return 404
    case 6: // NOT_READ_FIRST — only happens if read failed silently
    case 7: // MODIFIED_SINCE_READ
    case 8: // STRING_NOT_FOUND
    case 9: // AMBIGUOUS_MATCH
      return 409
    case 101: // SCOPE_VIOLATION
    case 102: // SECRET_DETECTED
      return 403
    case 110: // INVALID_URI
      return 400
    case 401:
      return 401
    case 403:
      return 403
    default:
      return 502
  }
}

function errorBody(res: McpResult<unknown> & { ok: false }) {
  return {
    error: 'edit_failed',
    code: res.errorCode,
    message: res.message,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value
  if (!key) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: EditBody
  try {
    body = (await req.json()) as EditBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const file_path = body.file_path
  const old_string = body.old_string
  const new_string = body.new_string
  if (!isReasonableString(file_path, 1024)) {
    return NextResponse.json({ error: 'invalid_file_path' }, { status: 400 })
  }
  if (!isReasonableString(old_string, MAX_STRING_BYTES)) {
    return NextResponse.json({ error: 'invalid_old_string' }, { status: 400 })
  }
  if (!isReasonableString(new_string, MAX_STRING_BYTES)) {
    return NextResponse.json({ error: 'invalid_new_string' }, { status: 400 })
  }
  if (old_string === new_string) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 })
  }
  const replace_all =
    typeof body.replace_all === 'boolean' ? body.replace_all : undefined
  const parent_blob_sha =
    typeof body.parent_blob_sha === 'string' && body.parent_blob_sha.length > 0
      ? body.parent_blob_sha
      : undefined

  // Fast path: caller already saw this file's blob_sha during page SSR
  // and threaded it through. Skip the Read round-trip; the Worker uses
  // parent_blob_sha as the staleness proof itself. ~50% latency win.
  //
  // Slow path (no parent_blob_sha — older clients, defensive): do a
  // session-DO Read first to satisfy huozi_edit's Read-first invariant,
  // then Edit. Same correctness, twice the round-trips.
  if (parent_blob_sha === undefined) {
    const r = await cloudReadForEdit(key, file_path)
    if (!r.ok) {
      return NextResponse.json(errorBody(r), { status: statusFor(r.errorCode) })
    }
  }

  const e = await cloudEdit(key, {
    file_path,
    old_string,
    new_string,
    ...(replace_all !== undefined ? { replace_all } : {}),
    ...(parent_blob_sha !== undefined ? { parent_blob_sha } : {}),
  })
  if (!e.ok) {
    return NextResponse.json(errorBody(e), { status: statusFor(e.errorCode) })
  }

  // Drop the shell-data cache for this api_key so the next workspace
  // render sees fresh recent / glob (the edited file climbs to top of
  // recent; new sections inside the file may shift extracted page list).
  invalidateShellCache(shellCacheKey(key))

  return NextResponse.json({
    ok: true,
    commit_sha: e.data.commit_sha,
    new_blob_sha: e.data.new_blob_sha,
  })
}
