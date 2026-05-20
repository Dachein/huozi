/**
 * Inbound Email Routing handler for huozi-cloud.
 *
 * Cloudflare Email Routing catch-all on `*@mail.huozi.app` is configured
 * (via /admin/mail/setup) to deliver every inbound message to THIS Worker.
 * That used to be a separate `huozi-email-ingest` Worker forwarding over a
 * service binding; we merged it in so there's one deploy and one CF API
 * permission boundary. See `app/docs/tasks.md` §6.1.
 *
 * For every message:
 *   1. Parse the to-address. Reject anything that isn't `t-<token>@…`.
 *   2. Parse the MIME body via postal-mime → from / subject / text /
 *      Message-Id / In-Reply-To / References.
 *   3. Call `handleTasksEmailIngest` IN-PROCESS (no HTTP roundtrip) with
 *      a synthesized Request — keeps the validation + token lookup +
 *      allowlist + thread resolution path identical to the webhook path.
 *   4. Translate the response into an Email Routing verdict:
 *      stored → silent accept; dropped → silent drop; server error →
 *      reject (so the sender's MTA queues + retries instead of losing it).
 *
 * Rules:
 *   - Never bounce unknown tokens / allowlist-blocked senders. Bounces are
 *     an oracle for guessing live tokens.
 *   - Never throw out of `email()` — Cloudflare treats any thrown
 *     exception as a permanent failure with no retry. Catch everything
 *     and decide drop-vs-reject explicitly.
 */

import PostalMime, { type Address } from 'postal-mime'
import type { AdminEnv } from './admin.js'
import {
  handleTasksEmailIngest,
  performIngest,
  senderMatches,
  stripBrackets as stripBracketsId,
  type IngestRequest,
} from './tasks-ingest.js'
import { lookupActiveAlias, touchAliasUse } from './email-aliases.js'

const TOKEN_LOCAL_PREFIX = 't-'
const TOKEN_RE = /^[0-9a-f]{32}$/

/** CF Email Routing caps at ~25 MiB at the edge; we cap earlier to keep
 *  Worker memory predictable. */
const MAX_RAW_BYTES = 5 * 1024 * 1024

interface EmailIngestPayload {
  token: string
  from: string
  subject?: string
  body: string
  message_id?: string
  in_reply_to?: string
  references?: string[]
}

interface UpstreamResponse {
  ok: boolean
  drop_reason?: string
  mode?: 'append' | 'inbox'
  task_id?: string
  ticket_id?: string
  path?: string
  at?: string
  error?: string
}

function parseLocalPart(toAddress: string): string | null {
  const trimmed = toAddress.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return null
  const local = trimmed.slice(0, at)
  return local.length > 0 ? local : null
}

function tokenFromLocal(local: string): string | null {
  if (!local.startsWith(TOKEN_LOCAL_PREFIX)) return null
  const token = local.slice(TOKEN_LOCAL_PREFIX.length)
  return TOKEN_RE.test(token) ? token : null
}

function formatAddress(a: Address | undefined): string {
  if (!a) return ''
  if (a.name && a.address) return `${a.name} <${a.address}>`
  return a.address ?? a.name ?? ''
}

function stripBrackets(id: string | undefined | null): string | undefined {
  if (!id) return undefined
  const s = id.trim().replace(/^<|>$/g, '').trim()
  return s.length > 0 ? s : undefined
}

function parseReferences(raw: string | undefined | null): string[] | undefined {
  if (!raw) return undefined
  // RFC 5322 References = 1*msg-id; msg-ids are <abc@host> separated by
  // whitespace. Split on whitespace and strip brackets.
  const out: string[] = []
  for (const piece of raw.split(/\s+/)) {
    const id = stripBrackets(piece)
    if (id) out.push(id)
  }
  return out.length > 0 ? out : undefined
}

async function readAllBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array | null> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_RAW_BYTES) {
        reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  return merged
}

function debugLog(env: AdminEnv, ...args: unknown[]): void {
  if ((env as { DEBUG_LOG_DROPS?: string }).DEBUG_LOG_DROPS === '1') {
    console.log('[mail-inbound]', ...args)
  }
}

async function callIngestInProcess(
  env: AdminEnv,
  payload: EmailIngestPayload,
): Promise<{ status: number; body: UpstreamResponse | null }> {
  // Synthesize a Request so we can reuse the same handler the webhook path
  // uses. The admin secret comes from env, not the caller — the worker is
  // trusting itself. The URL is internal-only and never reaches the network.
  const adminSecret = env.HUOZI_ADMIN_SECRET
  if (!adminSecret) {
    return { status: 500, body: { ok: false, error: 'admin_secret_unset' } }
  }
  const req = new Request('https://huozi-cloud-internal/admin/tasks/email-ingest', {
    method: 'POST',
    headers: {
      'X-Admin-Secret': adminSecret,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  let res: Response
  try {
    res = await handleTasksEmailIngest(req, env)
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, error: err instanceof Error ? err.message : String(err) },
    }
  }
  let body: UpstreamResponse | null = null
  try {
    body = (await res.json()) as UpstreamResponse
  } catch {
    body = null
  }
  return { status: res.status, body }
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: AdminEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void ctx
  try {
    // ── 1. Decide which mailbox this is ─────────────────────────────
    const local = parseLocalPart(message.to)
    if (!local) {
      debugLog(env, 'drop: unparseable to-address', message.to)
      return
    }

    // ── 2. Parse MIME (needed by both paths) ────────────────────────
    const raw = await readAllBytes(message.raw)
    if (!raw) {
      message.setReject('Message too large for huozi-cloud mail-inbound')
      return
    }
    let parsed: Awaited<ReturnType<typeof PostalMime.parse>>
    try {
      parsed = await PostalMime.parse(raw)
    } catch (err) {
      debugLog(env, 'drop: mime parse failed', err)
      return
    }

    const from = formatAddress(parsed.from)
    if (!from) {
      debugLog(env, 'drop: no From header')
      return
    }

    const body = (parsed.text && parsed.text.trim()) || ''
    if (!body) {
      debugLog(env, 'drop: empty body')
      return
    }

    const subject =
      parsed.subject && parsed.subject.length > 0 ? parsed.subject : undefined
    const messageId = stripBracketsId(parsed.messageId ?? '') || undefined
    const inReplyTo = stripBracketsId(parsed.inReplyTo ?? '') || undefined
    const references = parseReferences(parsed.references)

    // ── 3. Dispatch by local-part shape ─────────────────────────────
    //  `t-<32hex>` → magic-token path (existing handleTasksEmailIngest)
    //  anything else → user-chosen alias path (this file owns it)
    const token = tokenFromLocal(local)
    if (token) {
      const payload: EmailIngestPayload = { token, from, body }
      if (subject) payload.subject = subject
      if (messageId) payload.message_id = messageId
      if (inReplyTo) payload.in_reply_to = inReplyTo
      if (references) payload.references = references
      const { status, body: upstream } = await callIngestInProcess(env, payload)
      applyEmailVerdict(message, env, status, upstream)
      return
    }

    // Alias path
    const alias = await lookupActiveAlias(env.DB, local)
    if (!alias) {
      // Either no claim, or paused. Silent drop either way (no oracle).
      debugLog(env, 'drop: unknown_or_paused_alias', local)
      return
    }
    let senders: string[] | null = null
    if (alias.allowed_senders) {
      try {
        const parsedJson = JSON.parse(alias.allowed_senders) as unknown
        if (Array.isArray(parsedJson)) {
          senders = parsedJson.filter((x): x is string => typeof x === 'string')
        }
      } catch {
        senders = null
      }
    }
    if (!senderMatches(senders, from)) {
      debugLog(env, 'drop: sender_not_allowed', local, from)
      return
    }

    const ingest: IngestRequest = {
      workspace_id: alias.workspace_id,
      user_id: alias.user_id,
      source: 'email',
      from,
      body,
    }
    if (subject) ingest.subject = subject
    if (messageId) ingest.message_id = messageId
    if (inReplyTo) ingest.in_reply_to = inReplyTo
    if (references) ingest.references = references

    const res = await performIngest(env, ingest)
    // Best-effort touch — never fail ingest because of timestamp update.
    touchAliasUse(env.DB, local).catch(() => {})
    const upstream = (await res.json().catch(() => null)) as UpstreamResponse | null
    applyEmailVerdict(message, env, res.status, upstream)
  } catch (err) {
    try {
      message.setReject('huozi-cloud mail-inbound transient error')
    } catch {
      // setReject can throw if verdict already given; swallow.
    }
    console.error('[mail-inbound] uncaught', err)
  }
}

function applyEmailVerdict(
  message: ForwardableEmailMessage,
  env: AdminEnv,
  status: number,
  upstream: UpstreamResponse | null,
): void {
  if (status >= 500 || status === 502 || status === 503 || status === 504) {
    message.setReject(`huozi-cloud mail-inbound ${status}`)
    return
  }
  if (status >= 400 && status !== 404) {
    debugLog(env, 'drop: ingest 4xx', status, upstream)
    return
  }
  if (upstream && upstream.ok === false) {
    debugLog(env, 'drop:', upstream.drop_reason ?? 'unknown')
    return
  }
  // ok=true (200): mail stored. Silent accept.
}
