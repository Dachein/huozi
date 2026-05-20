/**
 * Task orchestrator — the daemon's brain.
 *
 * Subscribes to commit events via `WsSubscriber`, reads the affected
 * Collection files via MCP, decides what to do, and drives the Claude
 * runner. The dispatch decision is purely "look at the latest event":
 *
 *   inbox.jsonl  →  promote each unrouted ingest into a task file
 *   tasks/<id>.jsonl, latest op:
 *     create / ingest      →  dispatch (first or resume per session existence)
 *     user_action          →  resume with a synthesized prompt
 *     anything else        →  ignore (it's our own write, or a tool round)
 *
 * Loop safety: we never act on commits that we just produced because
 * the dispatch decision is op-driven, and our writes only ever emit
 * `agent_turn` / `tool_*` / `result` / `routed` / `create` — none of
 * which trigger a fresh dispatch.
 *
 * Concurrency: one in-flight Claude per task. `inFlight` is a Set
 * guarding the dispatch entry point. The orchestrator does NOT
 * serialize different tasks against each other.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { log } from './log.js'
import type { Config } from './config.js'
import type { McpClient } from './mcp.js'
import type { ClaudeRunner } from './claude.js'
import type { CommitEvent } from './ws.js'

const INBOX_PATH = 'inbox.jsonl'
const TASK_PREFIX = 'tasks/'
const TASK_SUFFIX = '.jsonl'

interface ParsedLine {
  raw: Record<string, unknown>
}

/**
 * Canonical Tasks schema (subset). Mirrored from
 * `packages/huozi-cloud/src/storage/cloudflare/tasks-ingest.ts` and
 * `src/lib/tasks/schema.ts`. Three copies; keep them honest.
 */
const SCHEMA_LINE = JSON.stringify({
  op: 'schema',
  at: '__placeholder__',
  by: 'system',
  version: 1,
  schema: {
    title: 'Tasks',
    entity: {
      title_field: 'subject',
      subtitle_field: 'from',
      avatar_field: 'source_icon',
    },
    fields: {
      subject: { type: 'text', display: 'headline' },
      from: { type: 'email', display: 'subheadline' },
      source: { type: 'select', display: 'aside', filterable: true,
        options: [
          { value: 'email', label: 'Email' },
          { value: 'webhook', label: 'Webhook' },
          { value: 'manual', label: 'Manual' },
          { value: 'slack', label: 'Slack' },
        ] },
      status: { type: 'select', display: 'aside', filterable: true,
        options: [
          { value: 'pending', label: 'Pending', color: 'gray' },
          { value: 'working', label: 'Working', color: 'blue' },
          { value: 'awaiting_user', label: 'Awaiting', color: 'amber' },
          { value: 'done', label: 'Done', color: 'green' },
          { value: 'archived', label: 'Archived', color: 'slate' },
        ] },
      agent: { type: 'select', display: 'aside',
        options: [{ value: 'claude-code', label: 'Claude Code' }] },
      body: { type: 'richtext', display: 'body' },
    },
    list_view: {
      filters: ['status', 'agent', 'source'],
      search: ['subject', 'from', 'body'],
    },
  },
})

function nowIso(): string {
  return new Date().toISOString()
}

function buildSchemaLine(): string {
  return SCHEMA_LINE.replace('__placeholder__', nowIso())
}

function parseLines(content: string): ParsedLine[] {
  const out: ParsedLine[] = []
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      if (obj && typeof obj === 'object') out.push({ raw: obj })
    } catch {
      // skip malformed lines; the renderer surfaces them, we don't care
    }
  }
  return out
}

function lastBusinessEvent(lines: ParsedLine[], id: string): Record<string, unknown> | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const r = lines[i]!.raw
    if (r['op'] === 'schema') continue
    if (r['id'] === id) return r
  }
  return null
}

function encodeCwd(cwd: string): string {
  // Claude Code's session-store path encoder: every non-alphanumeric
  // character becomes `-`. Matches what /docs/en/sessions.md describes.
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function claudeSessionExists(taskId: string, workdir: string): boolean {
  const file = join(homedir(), '.claude', 'projects', encodeCwd(workdir), `${taskId}.jsonl`)
  return existsSync(file)
}

interface PendingTicket {
  ticketId: string
  source: string
  subject?: string
  from?: string
  body: string
  messageId?: string
}

export class Orchestrator {
  private inFlight = new Set<string>()

  constructor(
    private cfg: Config,
    private mcp: McpClient,
    private claude: ClaudeRunner,
  ) {}

  /** Re-scan inbox + open tasks on (re)connect. v0: minimal — just inbox. */
  async catchUp(): Promise<void> {
    log.info('catchUp scanning inbox')
    await this.processInbox().catch((err) =>
      log.error('catchUp processInbox failed', { err: String(err) }),
    )
  }

  async handleCommit(commit: CommitEvent): Promise<void> {
    for (const entry of commit.paths) {
      const path = entry.path
      if (path === INBOX_PATH) {
        await this.processInbox().catch((err) =>
          log.error('processInbox failed', { err: String(err) }),
        )
      } else if (path.startsWith(TASK_PREFIX) && path.endsWith(TASK_SUFFIX)) {
        const taskId = path.slice(TASK_PREFIX.length, -TASK_SUFFIX.length)
        await this.processTask(taskId).catch((err) =>
          log.error('processTask failed', { err: String(err), task_id: taskId }),
        )
      }
    }
  }

  // ── Inbox → task promotion ───────────────────────────────────────

  private async processInbox(): Promise<void> {
    const file = await this.mcp.read(INBOX_PATH)
    if (!file) return
    const lines = parseLines(file.content)

    // Find ingest events that lack a matching routed event.
    const routedIds = new Set<string>()
    for (const { raw } of lines) {
      if (raw['op'] === 'routed' && typeof raw['task_id'] === 'string') {
        routedIds.add(raw['task_id'] as string)
      }
      if (raw['op'] === 'dismissed' && typeof raw['id'] === 'string') {
        routedIds.add(raw['id'] as string)
      }
    }
    const pending: PendingTicket[] = []
    for (const { raw } of lines) {
      if (raw['op'] !== 'ingest') continue
      const id = raw['id']
      if (typeof id !== 'string') continue
      if (routedIds.has(id)) continue
      pending.push({
        ticketId: id,
        source: typeof raw['source'] === 'string' ? (raw['source'] as string) : 'unknown',
        subject: typeof raw['subject'] === 'string' ? (raw['subject'] as string) : undefined,
        from: typeof raw['from'] === 'string' ? (raw['from'] as string) : undefined,
        body: typeof raw['body'] === 'string' ? (raw['body'] as string) : '',
        messageId: typeof raw['message_id'] === 'string' ? (raw['message_id'] as string) : undefined,
      })
    }
    if (pending.length === 0) return
    log.info('promoting tickets', { count: pending.length })
    for (const t of pending) {
      await this.promote(t).catch((err) =>
        log.error('promote failed', { err: String(err), ticket: t.ticketId }),
      )
    }
  }

  private async promote(t: PendingTicket): Promise<void> {
    const taskId = t.ticketId // reuse — keeps one ID across inbox + task
    const at = nowIso()

    // 1. Seed the task file with schema + create event.
    const createEvent: Record<string, unknown> = {
      id: taskId,
      at,
      by: 'agent:huozi-bridge',
      op: 'create',
      source: t.source,
      body: t.body,
    }
    if (t.subject !== undefined) createEvent['subject'] = t.subject
    if (t.from !== undefined) createEvent['from'] = t.from
    if (t.messageId !== undefined) createEvent['message_id'] = t.messageId

    await this.mcp.appendJsonl(
      `${TASK_PREFIX}${taskId}${TASK_SUFFIX}`,
      [JSON.stringify(createEvent)],
      { seedLinesIfMissing: [buildSchemaLine()] },
    )

    // 2. Append `routed` to inbox so subsequent processInbox skips it.
    const routedEvent = {
      id: t.ticketId,
      at,
      by: 'agent:huozi-bridge',
      op: 'routed',
      task_id: taskId,
    }
    await this.mcp.appendJsonl(INBOX_PATH, [JSON.stringify(routedEvent)])

    log.info('promoted', { task_id: taskId, source: t.source })
    // WS doesn't echo our own commits back to us, so kick off processing
    // directly rather than waiting on the commit feed.
    await this.processTask(taskId).catch((err) =>
      log.error('processTask after promote failed', { err: String(err), task_id: taskId }),
    )
  }

  // ── Task lifecycle ────────────────────────────────────────────────

  private async processTask(taskId: string): Promise<void> {
    if (this.inFlight.has(taskId)) {
      log.debug('task in flight, skipping', { task_id: taskId })
      return
    }
    const path = `${TASK_PREFIX}${taskId}${TASK_SUFFIX}`
    const file = await this.mcp.read(path)
    if (!file) return
    const lines = parseLines(file.content)
    const latest = lastBusinessEvent(lines, taskId)
    if (!latest) return

    const op = latest['op']
    if (op === 'create' || op === 'ingest') {
      const prompt = synthesizeDispatchPrompt(latest)
      await this.runClaude(taskId, prompt)
      return
    }
    if (op === 'user_action') {
      const prompt = synthesizeResumePrompt(latest)
      await this.runClaude(taskId, prompt)
      return
    }
    // Any other op (dispatch / agent_turn / tool_* / result / archive)
    // came from us, was already processed, or is terminal. Ignore.
  }

  private async runClaude(taskId: string, prompt: string): Promise<void> {
    if (this.inFlight.has(taskId)) return
    this.inFlight.add(taskId)
    try {
      const workdir = await this.claude.workdirFor(taskId)
      const resume = claudeSessionExists(taskId, workdir)
      const taskPath = `${TASK_PREFIX}${taskId}${TASK_SUFFIX}`

      // Per v3.3 spec §5.5: a task can have multiple runs. Every
      // dispatch starts a fresh `run_id`; all events emitted during
      // that run carry the same id so the timeline can fold into a
      // per-run view (resume / pause / restart all become discoverable).
      // `session_id` stays equal to `taskId` for now because Claude's
      // CLI couples its session-uuid to that argument — they're
      // logically distinct (run_id is "this dispatch", session_id is
      // "this Claude process") and may diverge once the bridge knows
      // a separate Claude session uuid.
      const runId = crypto.randomUUID()
      const dispatchEvent = {
        id: taskId,
        at: nowIso(),
        by: 'agent:huozi-bridge',
        op: 'dispatch',
        agent: 'claude-code',
        run_id: runId,
        session_id: taskId,
        ...(resume ? { resume: true } : {}),
      }
      await this.mcp.appendJsonl(taskPath, [JSON.stringify(dispatchEvent)])

      const result = await this.claude.dispatch(
        { taskId, prompt, isFirst: !resume },
        async (events) => {
          if (events.length === 0) return
          // Stamp every streamed event with this run's id so consumers
          // can group by run without re-deriving from timestamps.
          const lines = events.map((e) => JSON.stringify({ ...e, run_id: runId }))
          await this.mcp.appendJsonl(taskPath, lines)
        },
      )

      // If the runner already emitted a `result` line as part of the
      // stream (which it does for type:result), we won't duplicate. But
      // failure paths (non-zero exit, missing result event) need a
      // closing line so the projector lands on `done` / `failed`.
      if (!result.ok) {
        const errLine = {
          id: taskId,
          at: nowIso(),
          by: 'agent:huozi-bridge',
          op: 'result',
          run_id: runId,
          result_kind: 'error',
          summary: result.error ?? 'unknown error',
        }
        await this.mcp.appendJsonl(taskPath, [JSON.stringify(errLine)])
      }
    } catch (err) {
      log.error('runClaude unexpected', { task_id: taskId, err: String(err) })
    } finally {
      this.inFlight.delete(taskId)
    }
  }
}

// ── Prompt synthesis ────────────────────────────────────────────────

function synthesizeDispatchPrompt(latest: Record<string, unknown>): string {
  const subject = typeof latest['subject'] === 'string' ? (latest['subject'] as string) : ''
  const from = typeof latest['from'] === 'string' ? (latest['from'] as string) : ''
  const body = typeof latest['body'] === 'string' ? (latest['body'] as string) : ''
  const source = typeof latest['source'] === 'string' ? (latest['source'] as string) : 'unknown'

  // Keep the prompt structured but plain — Claude Code parses freeform.
  // Tell it explicitly to raise `confirm_requested` before any externally-
  // visible action so the user gets a review gate by default. Adjust this
  // policy in a router config later.
  return [
    `A new ${source} task arrived in this huozi workspace.`,
    '',
    from ? `From: ${from}` : null,
    subject ? `Subject: ${subject}` : null,
    '',
    'Body:',
    body,
    '',
    'Work on this task. Before performing any externally-visible action',
    '(sending a message, modifying production data, contacting a third',
    'party), pause and emit a clear summary asking the user to confirm.',
  ]
    .filter((x) => x !== null)
    .join('\n')
}

function synthesizeResumePrompt(latest: Record<string, unknown>): string {
  const action = typeof latest['action'] === 'string' ? (latest['action'] as string) : ''
  const note = typeof latest['note'] === 'string' ? (latest['note'] as string) : ''
  switch (action) {
    case 'approve':
      return note
        ? `User approved. Note: ${note}\n\nProceed with the action you proposed.`
        : 'User approved. Proceed with the action you proposed.'
    case 'reject':
      return note
        ? `User rejected. Reason: ${note}\n\nDo not perform the proposed action. Either revise per the reason and re-propose, or close the task.`
        : 'User rejected. Do not perform the proposed action; close the task.'
    case 'comment':
      return note
        ? `User comment: ${note}\n\nIncorporate this and continue.`
        : 'User left an empty comment. Continue.'
    default:
      return 'User responded. Re-read the last events and continue.'
  }
}
