/**
 * Tasks ingest endpoint — `/admin/tasks/ingest`.
 *
 * Server-to-server entry point called by:
 *   - `huozi-email-ingest` Worker (after token lookup, with email content)
 *   - Next.js `/api/app/tasks/ingest` (webhook proxy, HMAC-verified upstream)
 *
 * Responsibility: take a normalized ingest payload and append the matching
 * event to a Collection file in the target workspace.
 *
 * Thread resolution order (see `app/docs/tasks.md` §7):
 *   1. Explicit `task_id` in the payload → append to that task.
 *   2. `in_reply_to` or any `references` hits `task_message_index` →
 *      append to the resolved task.
 *   3. Otherwise → append to `inbox.jsonl` (a multi-entity Collection
 *      whose entries the daemon-side router will later promote).
 *
 * Files are seeded with the canonical schema event on first write so the
 * Collection viewer renders proper chrome immediately. The schema constant
 * is duplicated from `app/src/lib/tasks/schema.ts` — the Next.js side is
 * the source of truth for the renderer, this side is the source of truth
 * for what gets persisted. Keep them in sync; they're 60 lines of literal
 * JSON, the divergence cost is small.
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'
import { CloudflareStorage } from './storage.js'
import { StaleError, type Author } from '../types.js'
import { lookupActiveToken, touchTokenUse } from './email-tokens.js'

// ── Constants ─────────────────────────────────────────────────────────

const INBOX_PATH = 'inbox.jsonl'
const TASK_DIR_PREFIX = 'tasks/'
const MAX_BODY_BYTES = 1_000_000 // 1 MB cap on the ingested `body` field
const MAX_WRITE_RETRIES = 4
const VALID_SOURCES = new Set(['email', 'webhook', 'manual', 'slack'])

/**
 * Canonical Tasks schema — must stay in sync with the constant of the
 * same name in `app/src/lib/tasks/schema.ts`. See file header for why
 * we tolerate the duplication.
 */
const CANONICAL_TASK_SCHEMA = {
  title: 'Tasks',
  entity: {
    title_field: 'subject',
    subtitle_field: 'from',
    avatar_field: 'source_icon',
  },
  fields: {
    subject: { type: 'text', label: 'Subject', display: 'headline', searchable: true },
    from: { type: 'email', label: 'From', display: 'subheadline' },
    source: {
      type: 'select',
      label: 'Source',
      display: 'aside',
      filterable: true,
      options: [
        { value: 'email', label: 'Email' },
        { value: 'webhook', label: 'Webhook' },
        { value: 'manual', label: 'Manual' },
        { value: 'slack', label: 'Slack' },
      ],
    },
    status: {
      type: 'select',
      label: 'Status',
      display: 'aside',
      filterable: true,
      options: [
        { value: 'pending', label: 'Pending', color: 'gray' },
        { value: 'working', label: 'Working', color: 'blue' },
        { value: 'awaiting_user', label: 'Awaiting', color: 'amber' },
        { value: 'done', label: 'Done', color: 'green' },
        { value: 'archived', label: 'Archived', color: 'slate' },
      ],
    },
    agent: {
      type: 'select',
      label: 'Agent',
      display: 'aside',
      filterable: true,
      options: [{ value: 'claude-code', label: 'Claude Code' }],
    },
    tags: { type: 'multi_select', label: 'Tags', display: 'meta', filterable: true, options: [] },
    category: { type: 'select', label: 'Category', display: 'meta', filterable: true, options: [] },
    cost_usd: { type: 'number', label: 'Cost', display: 'meta' },
    body: { type: 'richtext', label: 'Body', display: 'body' },
  },
  list_view: {
    filters: ['status', 'agent', 'source', 'tags', 'category'],
    search: ['subject', 'from', 'body'],
  },
} as const

// ── Payload + helpers ─────────────────────────────────────────────────

export interface IngestRequest {
  workspace_id: string
  /** Authoring user — used for the `by` field on the event line. */
  user_id: string
  source: 'email' | 'webhook' | 'manual' | 'slack'
  /** Optional sender display. For email this is the parsed From header. */
  from?: string
  subject?: string
  /** Required — the message body. Plain text or markdown. */
  body: string
  /** Optional RFC 2822 Message-Id (no angle brackets) for thread indexing. */
  message_id?: string
  /** Optional In-Reply-To header (no angle brackets). */
  in_reply_to?: string
  /** Optional References list (no angle brackets per entry). */
  references?: string[]
  /** Explicit existing task; bypasses Message-Id resolution. */
  task_id?: string
}

function uuidV4(): string {
  // crypto.randomUUID() is available in Workers runtime as of late 2022.
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function nowMs(): number {
  return Date.now()
}

export function stripBrackets(id: string): string {
  return id.replace(/^<|>$/g, '').trim()
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function looksLikeWorkspacePath(s: string): boolean {
  // Reject anything that would escape the tasks/ folder or break path canon.
  if (s.includes('..')) return false
  if (s.includes('/')) return false
  if (s.startsWith('.')) return false
  return true
}

function validateIngest(body: unknown): IngestRequest | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' }
  const b = body as Record<string, unknown>
  if (typeof b.workspace_id !== 'string' || !b.workspace_id) return { error: 'missing_workspace_id' }
  if (typeof b.user_id !== 'string' || !b.user_id) return { error: 'missing_user_id' }
  if (typeof b.source !== 'string' || !VALID_SOURCES.has(b.source)) return { error: 'invalid_source' }
  if (typeof b.body !== 'string') return { error: 'missing_body' }
  if (b.body.length > MAX_BODY_BYTES) return { error: 'body_too_large' }
  const out: IngestRequest = {
    workspace_id: b.workspace_id,
    user_id: b.user_id,
    source: b.source as IngestRequest['source'],
    body: b.body,
  }
  if (typeof b.from === 'string' && b.from.length > 0) out.from = b.from
  if (typeof b.subject === 'string' && b.subject.length > 0) out.subject = b.subject
  if (typeof b.message_id === 'string' && b.message_id.length > 0) {
    out.message_id = stripBrackets(b.message_id)
  }
  if (typeof b.in_reply_to === 'string' && b.in_reply_to.length > 0) {
    out.in_reply_to = stripBrackets(b.in_reply_to)
  }
  if (Array.isArray(b.references)) {
    const refs = b.references
      .filter((r): r is string => typeof r === 'string' && r.length > 0)
      .map(stripBrackets)
    if (refs.length > 0) out.references = refs
  }
  if (typeof b.task_id === 'string' && b.task_id.length > 0) {
    if (!looksLikeUuid(b.task_id) || !looksLikeWorkspacePath(b.task_id)) {
      return { error: 'invalid_task_id' }
    }
    out.task_id = b.task_id.toLowerCase()
  }
  return out
}

// ── Thread resolution ─────────────────────────────────────────────────

async function lookupTaskByMessageIds(
  db: D1Database,
  workspaceId: string,
  candidates: string[],
): Promise<string | null> {
  if (candidates.length === 0) return null
  const placeholders = candidates.map(() => '?').join(',')
  const row = await db
    .prepare(
      `SELECT task_id FROM task_message_index
       WHERE workspace_id = ? AND message_id IN (${placeholders})
       LIMIT 1`,
    )
    .bind(workspaceId, ...candidates)
    .first<{ task_id: string }>()
  return row?.task_id ?? null
}

async function recordMessageId(
  db: D1Database,
  workspaceId: string,
  taskId: string,
  messageId: string,
): Promise<void> {
  // INSERT OR IGNORE so the same Message-Id seen twice doesn't error.
  // Forged In-Reply-To from a different workspace can never collide because
  // (workspace_id, message_id) is the composite PK.
  await db
    .prepare(
      `INSERT OR IGNORE INTO task_message_index
         (workspace_id, message_id, task_id, recorded_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(workspaceId, messageId, taskId, nowMs())
    .run()
}

// ── Event composition ─────────────────────────────────────────────────

function buildSchemaLine(): string {
  const event = {
    op: 'schema',
    at: nowIso(),
    by: 'system',
    version: 1,
    schema: CANONICAL_TASK_SCHEMA,
  }
  return JSON.stringify(event)
}

interface InboxIngestPayload {
  id: string // ticket id (uuid v4)
  at: string
  by: string
  op: 'ingest'
  source: string
  from?: string
  subject?: string
  body: string
  message_id?: string
}

interface TaskCreatePayload {
  id: string // task_id, same value on every line of this file
  at: string
  by: string
  op: 'create'
  source: string
  from?: string
  subject?: string
  body: string
  message_id?: string
}

interface TaskFollowupPayload {
  id: string // task_id
  at: string
  by: string
  op: 'ingest'
  source: string
  from?: string
  subject?: string
  body: string
  message_id?: string
}

function eventLine(
  payload: InboxIngestPayload | TaskCreatePayload | TaskFollowupPayload,
): string {
  // JSON.stringify drops keys with `undefined` values, which gives us the
  // semantic-patch-style compactness we want.
  return JSON.stringify(payload)
}

// ── Storage append with optimistic retry ──────────────────────────────

/**
 * Append one or more JSONL event lines to a Tasks Collection (an
 * `inbox.jsonl` or `tasks/<id>.jsonl`) with optimistic retry. Exported
 * so the confirm endpoint and any future Tasks-shaped Collection writer
 * can reuse the same staleness-retry contract. `seedIfMissing=true`
 * prepends the canonical schema event when the file doesn't exist yet
 * (only safe for files that follow the Tasks schema convention).
 */
export async function appendLines(
  storage: CloudflareStorage,
  workspaceId: string,
  path: string,
  author: Author,
  lines: string[],
  seedIfMissing: boolean,
): Promise<void> {
  const encoder = new TextEncoder()
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await storage.readFile(workspaceId, path)
    let nextContent: string
    let parentSha: string | null
    if (existing) {
      const tail = existing.content.byteLength === 0 ? '' : '\n'
      const decoded = new TextDecoder().decode(existing.content)
      // Trim a single trailing newline before joining so we don't end up
      // with blank lines; the JSONL parser tolerates them but we shouldn't
      // emit them.
      const trimmed = decoded.endsWith('\n') ? decoded.slice(0, -1) : decoded
      nextContent = trimmed + tail + lines.join('\n') + '\n'
      parentSha = existing.blob_sha
    } else {
      if (!seedIfMissing) {
        throw new Error(`task file missing and seedIfMissing=false: ${path}`)
      }
      nextContent = [buildSchemaLine(), ...lines].join('\n') + '\n'
      parentSha = null
    }
    try {
      await storage.writeFile({
        workspaceId,
        path,
        content: encoder.encode(nextContent),
        author,
        parent_sha: parentSha,
        message: `tasks: append (${lines.length} event${lines.length === 1 ? '' : 's'})`,
        content_type: 'application/jsonl',
      })
      return
    } catch (err) {
      if (err instanceof StaleError) {
        // Someone else wrote between our read and write. Re-read and retry.
        continue
      }
      throw err
    }
  }
  throw new Error(`failed to append to ${path} after ${MAX_WRITE_RETRIES} attempts`)
}

// ── Inner ingest pipeline (validated payload → Collection write) ──────

/**
 * Run the validated ingest pipeline: resolve thread, append event, index
 * Message-Id. Exported so the email-ingest endpoint can reuse it after
 * doing its own auth (token lookup + allowlist check) without redoing
 * validation.
 */
export async function performIngest(
  env: AdminEnv,
  req: IngestRequest,
): Promise<Response> {
  const storage = new CloudflareStorage(env)
  const author: Author = { id: req.user_id, type: 'user' }

  let resolvedTaskId: string | null = null
  if (req.task_id) {
    resolvedTaskId = req.task_id
  } else {
    const candidates: string[] = []
    if (req.in_reply_to) candidates.push(req.in_reply_to)
    if (req.references) for (const r of req.references) candidates.push(r)
    resolvedTaskId = await lookupTaskByMessageIds(env.DB, req.workspace_id, candidates)
  }

  const at = nowIso()

  if (resolvedTaskId) {
    const path = `${TASK_DIR_PREFIX}${resolvedTaskId}.jsonl`
    const payload: TaskFollowupPayload = {
      id: resolvedTaskId,
      at,
      by: `user:${req.user_id}`,
      op: 'ingest',
      source: req.source,
      ...(req.from !== undefined ? { from: req.from } : {}),
      ...(req.subject !== undefined ? { subject: req.subject } : {}),
      body: req.body,
      ...(req.message_id !== undefined ? { message_id: req.message_id } : {}),
    }
    await appendLines(storage, req.workspace_id, path, author, [eventLine(payload)], true)
    if (req.message_id) {
      await recordMessageId(env.DB, req.workspace_id, resolvedTaskId, req.message_id)
    }
    return Response.json({ ok: true, mode: 'append', task_id: resolvedTaskId, path, at })
  }

  const ticketId = uuidV4()
  const inboxPayload: InboxIngestPayload = {
    id: ticketId,
    at,
    by: `user:${req.user_id}`,
    op: 'ingest',
    source: req.source,
    ...(req.from !== undefined ? { from: req.from } : {}),
    ...(req.subject !== undefined ? { subject: req.subject } : {}),
    body: req.body,
    ...(req.message_id !== undefined ? { message_id: req.message_id } : {}),
  }
  await appendLines(storage, req.workspace_id, INBOX_PATH, author, [eventLine(inboxPayload)], true)
  return Response.json({ ok: true, mode: 'inbox', ticket_id: ticketId, path: INBOX_PATH, at })
}

// ── Public admin handlers ─────────────────────────────────────────────

export async function handleTasksIngest(
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
  const validated = validateIngest(raw)
  if ('error' in validated) return Response.json({ error: validated.error }, { status: 400 })
  return performIngest(env, validated)
}

/**
 * Aggregate endpoint for the standalone `huozi-email-ingest` Worker.
 * Takes a parsed email payload plus the magic-address token, resolves
 * the token to (workspace, user), checks the sender allowlist, and
 * delegates to `performIngest`. One round-trip per inbound mail.
 *
 * Failure modes return 200 with `{ok:false, drop_reason}` rather than
 * non-2xx, so the caller (email Worker) doesn't bounce silent-drop
 * cases back to the sender. Genuine 5xx is reserved for server faults.
 */
export interface EmailIngestRequest {
  token: string
  from: string
  subject?: string
  body: string
  message_id?: string
  in_reply_to?: string
  references?: string[]
}

export function senderMatches(allowed: string[] | null, from: string): boolean {
  if (!allowed || allowed.length === 0) return true
  // Extract the domain portion of "Display Name <user@domain>" or "user@domain".
  const m = from.match(/<([^>]+)>/) ?? from.match(/([^\s<>"]+@[^\s<>"]+)/)
  const addr = m ? m[1]! : from
  const at = addr.lastIndexOf('@')
  if (at < 0) return false
  const domain = addr.slice(at + 1).trim().toLowerCase()
  if (!domain) return false
  for (const d of allowed) {
    const norm = d.toLowerCase()
    if (domain === norm || domain.endsWith(`.${norm}`)) return true
  }
  return false
}

export async function handleTasksEmailIngest(
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
  if (!raw || typeof raw !== 'object') {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  const b = raw as Record<string, unknown>
  if (typeof b.token !== 'string' || !/^[0-9a-f]{32}$/.test(b.token)) {
    return Response.json({ error: 'invalid_token' }, { status: 400 })
  }
  if (typeof b.from !== 'string' || !b.from) {
    return Response.json({ error: 'missing_from' }, { status: 400 })
  }
  if (typeof b.body !== 'string') {
    return Response.json({ error: 'missing_body' }, { status: 400 })
  }
  if (b.body.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'body_too_large' }, { status: 400 })
  }

  const lookup = await lookupActiveToken(env.DB, b.token)
  if (!lookup) {
    // Unknown / revoked. Return 200 with drop_reason so the email Worker
    // can log and silently discard without bouncing (avoids token oracle).
    return Response.json({ ok: false, drop_reason: 'unknown_token' })
  }
  if (!senderMatches(lookup.allowed_senders, b.from)) {
    return Response.json({ ok: false, drop_reason: 'sender_not_allowed' })
  }

  const ingest: IngestRequest = {
    workspace_id: lookup.workspace_id,
    user_id: lookup.user_id,
    source: 'email',
    from: b.from,
    body: b.body,
  }
  if (typeof b.subject === 'string' && b.subject.length > 0) ingest.subject = b.subject
  if (typeof b.message_id === 'string' && b.message_id.length > 0) {
    ingest.message_id = stripBrackets(b.message_id)
  }
  if (typeof b.in_reply_to === 'string' && b.in_reply_to.length > 0) {
    ingest.in_reply_to = stripBrackets(b.in_reply_to)
  }
  if (Array.isArray(b.references)) {
    const refs = b.references
      .filter((r): r is string => typeof r === 'string' && r.length > 0)
      .map(stripBrackets)
    if (refs.length > 0) ingest.references = refs
  }

  const result = await performIngest(env, ingest)
  // Best-effort touch — don't fail the ingest if this errors.
  touchTokenUse(env.DB, b.token).catch(() => {})
  return result
}
