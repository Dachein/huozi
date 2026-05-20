/**
 * Tasks confirm endpoint — `/admin/tasks/confirm`.
 *
 * Called by Next.js when the user clicks Approve / Reject on a task that
 * raised a `confirm_requested` event (see `app/docs/tasks.md` §9). The
 * handler appends a `user_action` event to the target task file; the
 * daemon's WebSocket subscription will then see the new commit and
 * resume the Claude session with the synthesized prompt.
 *
 * No thread resolution here — the task_id is known and authoritative.
 * Refuses if the task file doesn't already exist (we never want a confirm
 * click to invent a task out of thin air).
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'
import { CloudflareStorage } from './storage.js'
import type { Author } from '../types.js'
import { appendLines } from './tasks-ingest.js'

const TASK_DIR_PREFIX = 'tasks/'
const VALID_ACTIONS = new Set(['approve', 'reject', 'comment'])
const MAX_NOTE_BYTES = 4_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ConfirmRequest {
  workspace_id: string
  task_id: string
  user_id: string
  action: 'approve' | 'reject' | 'comment'
  /** Optional free-text note attached to the action. */
  note?: string
}

function validate(body: unknown): ConfirmRequest | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' }
  const b = body as Record<string, unknown>
  if (typeof b.workspace_id !== 'string' || !b.workspace_id) return { error: 'missing_workspace_id' }
  if (typeof b.user_id !== 'string' || !b.user_id) return { error: 'missing_user_id' }
  if (typeof b.task_id !== 'string' || !UUID_RE.test(b.task_id)) return { error: 'invalid_task_id' }
  if (typeof b.action !== 'string' || !VALID_ACTIONS.has(b.action)) return { error: 'invalid_action' }
  const out: ConfirmRequest = {
    workspace_id: b.workspace_id,
    task_id: b.task_id.toLowerCase(),
    user_id: b.user_id,
    action: b.action as ConfirmRequest['action'],
  }
  if (typeof b.note === 'string' && b.note.length > 0) {
    if (b.note.length > MAX_NOTE_BYTES) return { error: 'note_too_large' }
    out.note = b.note
  }
  return out
}

export async function handleTasksConfirm(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  assertAdminAuth(request, env)
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const validated = validate(raw)
  if ('error' in validated) return Response.json({ error: validated.error }, { status: 400 })
  const req = validated

  const storage = new CloudflareStorage(env)
  const author: Author = { id: req.user_id, type: 'user', confirmed: true }
  const path = `${TASK_DIR_PREFIX}${req.task_id}.jsonl`
  const at = new Date().toISOString()

  const payload: Record<string, unknown> = {
    id: req.task_id,
    at,
    by: `user:${req.user_id}`,
    op: 'user_action',
    action: req.action,
  }
  if (req.note !== undefined) payload.note = req.note

  try {
    await appendLines(
      storage,
      req.workspace_id,
      path,
      author,
      [JSON.stringify(payload)],
      // Refuse to seed: confirming a non-existent task is a client bug.
      false,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('task file missing')) {
      return Response.json({ error: 'unknown_task' }, { status: 404 })
    }
    return Response.json({ error: 'write_failed', message: msg }, { status: 500 })
  }
  return Response.json({ ok: true, task_id: req.task_id, path, at, action: req.action })
}
