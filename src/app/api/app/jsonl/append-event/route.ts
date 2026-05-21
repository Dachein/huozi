/**
 * POST /api/app/jsonl/append-event  { file_path, event }
 *
 * Generic Collection event appender — the one mutation endpoint for any
 * `.jsonl` file the UI cares about (inbox triage / Promote, task status
 * updates, ad-hoc Collection edits). Server-side composes the new event
 * line, reads the current file via the user's api_key, and appends.
 *
 * Why one endpoint instead of per-Collection ones:
 *   - v3.3 collapsed memory + task lifecycle to "just append jsonl
 *     events" — there's no specialised MCP tool anymore. The Web side
 *     gets the same simplification by routing every append through this
 *     single shape.
 *   - Auto-fills `at` (now) and `by` (caller principal). If the caller
 *     omits `id`, mints a fresh UUID v4 — so the Promote flow can call
 *     this with just `op` + `title` + `source_refs` and let the server
 *     pick the task id.
 *
 * Atomicity: read → compose → edit is two huozi_* tool round-trips; the
 * second uses `parent_blob_sha` from the first as the freshness proof,
 * so a concurrent write to the same file lands a 409 cleanly.
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import {
  cloudEdit,
  cloudRead,
  HUOZI_CLOUD_KEY_COOKIE,
} from '@/lib/drive/mcp-client'
import { getIdentity } from '@/lib/identity'

interface AppendBody {
  file_path?: unknown
  event?: unknown
}

const MAX_PATH = 1024
const MAX_EVENT_BYTES = 200_000

function statusFor(code: number): number {
  switch (code) {
    case 4: // FILE_NOT_FOUND
      return 404
    case 6: // NOT_READ_FIRST
    case 7: // MODIFIED_SINCE_READ
    case 8: // STRING_NOT_FOUND
      return 409
    case 101: // SCOPE_VIOLATION
    case 102: // SECRET_DETECTED
      return 403
    case 110: // INVALID_URI
      return 400
    default:
      return 502
  }
}

/**
 * Strip the cat -n line-number prefix huozi_read returns ("  001\t…").
 * Mirrors stripCatN from mcp-client but inlined to avoid an import
 * cycle with the SSR-only helpers.
 */
function stripLineNumbers(content: string): string {
  return content.replace(/^ *\d+\t/gm, '')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value
  if (!key) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: AppendBody
  try {
    body = (await req.json()) as AppendBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (
    typeof body.file_path !== 'string' ||
    body.file_path.length === 0 ||
    body.file_path.length > MAX_PATH
  ) {
    return NextResponse.json({ error: 'invalid_file_path' }, { status: 400 })
  }
  if (!body.file_path.endsWith('.jsonl')) {
    return NextResponse.json(
      { error: 'file_path must end in .jsonl' },
      { status: 400 },
    )
  }
  if (body.event === null || typeof body.event !== 'object') {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
  }

  const filePath = body.file_path
  const incoming = body.event as Record<string, unknown>
  if (typeof incoming.op !== 'string' || incoming.op.length === 0) {
    return NextResponse.json(
      { error: 'event.op is required' },
      { status: 400 },
    )
  }

  // Read current file content. We use cloudRead (SSR path) so the
  // session-DO state isn't involved — parent_blob_sha is the only
  // freshness proof we need.
  const r = await cloudRead(key, filePath)
  if (!r.ok) {
    return NextResponse.json(
      { error: 'read_failed', code: r.errorCode, message: r.message },
      { status: statusFor(r.errorCode) },
    )
  }
  if (r.data.type !== 'text' || typeof r.data.file?.content !== 'string') {
    return NextResponse.json(
      { error: 'file_not_text' },
      { status: 400 },
    )
  }
  const rawContent = r.data.file.content
  const parent_blob_sha = r.data.file.blob_sha
  if (typeof parent_blob_sha !== 'string') {
    return NextResponse.json({ error: 'missing_blob_sha' }, { status: 500 })
  }

  // Compose the event line. Server auto-fills id (if missing), at, by.
  const principal = await (await getIdentity()).getPrincipal()
  const at = new Date().toISOString()
  const by = principal ? `user:${principal.userId}` : 'user:unknown'
  const id =
    typeof incoming.id === 'string' && incoming.id.length > 0
      ? incoming.id
      : crypto.randomUUID()
  const event = {
    id,
    at,
    by,
    ...incoming,
  }
  const newLine = JSON.stringify(event)
  if (newLine.length > MAX_EVENT_BYTES) {
    return NextResponse.json(
      { error: 'event_too_large' },
      { status: 413 },
    )
  }

  // Compose new content: keep existing lines, append the new one.
  // Use huozi_edit with old_string = last meaningful line so the diff
  // is minimal and conflict-resilient. Simplest: append at the very
  // end — huozi_edit needs an old_string match, so we anchor on the
  // file's trailing characters.
  const decoded = stripLineNumbers(rawContent)
  // Make sure we land on `<existing>\n<new>\n` — trim a single trailing
  // newline if present so the diff is just "+ new line\n".
  const trimmed = decoded.endsWith('\n') ? decoded.slice(0, -1) : decoded
  const oldString = trimmed.length > 0 ? trimmed + '\n' : ''
  const newString = (trimmed.length > 0 ? trimmed + '\n' : '') + newLine + '\n'

  if (oldString.length === 0) {
    // Empty file — huozi_edit needs old_string non-empty. Use a tiny
    // sentinel write via huozi_edit with empty old_string is unsupported
    // (the tool requires Read-first + non-empty). For now, refuse — the
    // Project Upgrade flow seeds tasks.jsonl with the schema header so
    // the empty case shouldn't occur in practice.
    return NextResponse.json(
      { error: 'file_is_empty', message: 'Cannot append to empty file; expected a schema header line.' },
      { status: 400 },
    )
  }

  const e = await cloudEdit(key, {
    file_path: filePath,
    old_string: oldString,
    new_string: newString,
    parent_blob_sha,
  })
  if (!e.ok) {
    return NextResponse.json(
      { error: 'edit_failed', code: e.errorCode, message: e.message },
      { status: statusFor(e.errorCode) },
    )
  }

  return NextResponse.json({
    ok: true,
    file_path: filePath,
    event_id: id,
    commit_sha: e.data.commit_sha,
    new_blob_sha: e.data.new_blob_sha,
  })
}
