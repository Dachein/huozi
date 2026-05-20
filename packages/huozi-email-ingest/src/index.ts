/**
 * huozi-email-ingest Worker.
 *
 * Cloudflare Email Routing catch-all on `*@mail.huozi.app` lands here.
 * For every inbound message we:
 *
 *   1. Parse the to-address. Reject anything that isn't `t-<token>@…`.
 *   2. Parse the MIME body via postal-mime → from / subject / text /
 *      Message-Id / In-Reply-To / References.
 *   3. POST the parsed shape + token to huozi-cloud's
 *      `/admin/tasks/email-ingest` over the CLOUD service binding.
 *      The main Worker handles token lookup, allowlist enforcement,
 *      thread resolution, and the Collection write.
 *   4. Translate the upstream response into an Email Routing verdict:
 *      stored → silent accept; dropped → silent drop; server error →
 *      reject (so the sender's MTA queues + retries instead of losing
 *      the message).
 *
 * Design rules:
 *   - Never bounce unknown tokens or allowlist-blocked senders. A bounce
 *     stream is an oracle for guessing live tokens / allowlist contents.
 *   - Never throw out of `email()` — Cloudflare treats any thrown
 *     exception as a permanent failure with no retry, which loses mail.
 *     Catch everything and decide drop-vs-reject explicitly.
 *   - Keep the Worker stateless. All state (D1, R2, DOs) lives in
 *     huozi-cloud; this Worker is a thin parser + forwarder.
 *
 * See `app/docs/tasks.md` §6.1 and the comments on
 * `handleTasksEmailIngest` in huozi-cloud for the contract.
 */

import PostalMime, { type Address } from 'postal-mime'

export interface Env {
  /** Service binding to the huozi-cloud Worker. */
  CLOUD: Fetcher
  /** Shared admin secret (must match huozi-cloud's HUOZI_ADMIN_SECRET). */
  HUOZI_ADMIN_SECRET: string
  /** When "1", silent-drop reasons are written to the log stream. */
  DEBUG_LOG_DROPS: string
}

const TOKEN_LOCAL_PREFIX = 't-'
const TOKEN_RE = /^[0-9a-f]{32}$/

/** Max raw email size we'll bother forwarding. CF Email Routing caps at
 *  ~25 MiB at the edge; we cap earlier to keep memory predictable. */
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

function parseToken(toAddress: string): string | null {
  const trimmed = toAddress.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return null
  const local = trimmed.slice(0, at)
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

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
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

function debugLog(env: Env, ...args: unknown[]): void {
  if (env.DEBUG_LOG_DROPS === '1') console.log('[huozi-email-ingest]', ...args)
}

async function callIngest(
  env: Env,
  payload: EmailIngestPayload,
): Promise<{ status: number; body: UpstreamResponse | null }> {
  const res = await env.CLOUD.fetch(
    new Request('https://huozi-cloud-internal/admin/tasks/email-ingest', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': env.HUOZI_ADMIN_SECRET,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
  )
  let body: UpstreamResponse | null = null
  try {
    body = (await res.json()) as UpstreamResponse
  } catch {
    body = null
  }
  return { status: res.status, body }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      // ── 1. Token from to-address ──────────────────────────────────
      const token = parseToken(message.to)
      if (!token) {
        debugLog(env, 'drop: unparseable to-address', message.to)
        return // silent accept (drop)
      }

      // ── 2. Parse MIME ─────────────────────────────────────────────
      const raw = await readAllBytes(message.raw)
      if (!raw) {
        // Oversized: reject so the sender knows. Better than silent loss
        // because oversized mail isn't an attack pattern, it's a mistake.
        message.setReject('Message too large for huozi-email-ingest')
        return
      }
      let parsed: Awaited<ReturnType<typeof PostalMime.parse>>
      try {
        parsed = await PostalMime.parse(raw)
      } catch (err) {
        debugLog(env, 'drop: mime parse failed', err)
        // Don't reject on malformed MIME — bouncing parser errors is more
        // noise than signal. Silent drop.
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

      const payload: EmailIngestPayload = {
        token,
        from,
        body,
      }
      if (parsed.subject && parsed.subject.length > 0) payload.subject = parsed.subject
      const messageId = stripBrackets(parsed.messageId)
      if (messageId) payload.message_id = messageId
      const inReplyTo = stripBrackets(parsed.inReplyTo)
      if (inReplyTo) payload.in_reply_to = inReplyTo
      const references = parseReferences(parsed.references)
      if (references) payload.references = references

      // ── 3. Forward to huozi-cloud ─────────────────────────────────
      const { status, body: upstream } = await callIngest(env, payload)

      // ── 4. Translate to verdict ───────────────────────────────────
      if (status >= 500 || status === 502 || status === 503 || status === 504) {
        // Server fault → reject so the sender's MTA retries later.
        message.setReject(`huozi-cloud ${status}`)
        return
      }
      if (status >= 400 && status !== 404) {
        // 4xx (other than 404) usually means malformed request — log
        // and drop. Don't bounce, the sender can't fix it.
        debugLog(env, 'drop: upstream 4xx', status, upstream)
        return
      }
      if (upstream && upstream.ok === false) {
        debugLog(env, 'drop:', upstream.drop_reason ?? 'unknown')
        return
      }
      // ok=true (200): mail was stored. Silent accept.
      // No-op return.
    } catch (err) {
      // Defensive catch: never let an exception escape email().
      // Reject so the sender's MTA retries instead of losing the mail.
      try {
        message.setReject('huozi-email-ingest transient error')
      } catch {
        // setReject can throw if verdict already given; swallow.
      }
      console.error('[huozi-email-ingest] uncaught', err)
    }
    // Mark ctx as intentionally unused. ExecutionContext.waitUntil is
    // available if we ever want background tasks; not used in v1.
    void ctx
  },
}
