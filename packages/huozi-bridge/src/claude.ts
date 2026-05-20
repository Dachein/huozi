/**
 * Spawn `claude -p` with stream-json output and translate the stream
 * into huozi event lines for `tasks/<task_id>.jsonl`.
 *
 * Event mapping (see app/docs/tasks.md §3):
 *   stream-json type           → huozi op
 *   ────────────────────────── → ────────────
 *   system/init                → (skipped — daemon already emitted dispatch)
 *   assistant                  → agent_turn
 *   tool_use                   → tool_use
 *   tool_result                → tool_result
 *   result                     → result
 *
 * Idempotency:
 *   stream-json events carry a `uuid` on most messages and a `tool_use_id`
 *   on tool_use/tool_result. We dedupe with a per-task Set so a daemon
 *   restart that re-processes a commit doesn't double-write. Crash
 *   resilience across full restarts is intentionally weak in v0 — the
 *   WS subscription only delivers commits going forward, so on restart
 *   we miss the in-flight Claude run entirely (the user re-triggers).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { log } from './log.js'
import type { Config } from './config.js'

export interface DispatchInput {
  taskId: string
  prompt: string
  /** True iff this is the first dispatch for this task (not a --resume). */
  isFirst: boolean
}

export type EventCallback = (events: Record<string, unknown>[]) => Promise<void>

export interface RunResult {
  ok: boolean
  cost_usd?: number
  stop_reason?: string
  error?: string
}

interface StreamMessage {
  type: string
  subtype?: string
  uuid?: string
  session_id?: string
  /**
   * `assistant` / `user` events wrap an Anthropic message here. Content
   * blocks (text / thinking / tool_use / tool_result) live inside
   * `message.content[]`, NOT as top-level fields.
   */
  message?: {
    id?: string
    role?: 'assistant' | 'user'
    content?: Array<Record<string, unknown>>
    [k: string]: unknown
  }
  /** result event fields (stream-json top-level on `type === 'result'`). */
  result?: string
  total_cost_usd?: number
  stop_reason?: string
  [k: string]: unknown
}

export class ClaudeRunner {
  /** task_id → set of event uuids already mirrored. */
  private seen = new Map<string, Set<string>>()

  constructor(private cfg: Config) {}

  /** Ensure a per-task workdir exists (cwd-keyed sessions need this). */
  async workdirFor(taskId: string): Promise<string> {
    const dir = join(this.cfg.workdirRoot, taskId)
    await mkdir(dir, { recursive: true })
    return dir
  }

  private getOrInitSeen(taskId: string): Set<string> {
    let s = this.seen.get(taskId)
    if (!s) {
      s = new Set<string>()
      this.seen.set(taskId, s)
    }
    return s
  }

  async dispatch(input: DispatchInput, onEvents: EventCallback): Promise<RunResult> {
    const cwd = await this.workdirFor(input.taskId)
    const seen = this.getOrInitSeen(input.taskId)

    const args: string[] = [
      // `--session-id` forces a NEW session with the given UUID; `--resume`
      // continues an existing one. They're mutually exclusive — pick based
      // on whether the session log already exists on disk.
      ...(input.isFirst
        ? ['--session-id', input.taskId]
        : ['--resume', input.taskId]),
      '-p', input.prompt,
      '--output-format', 'stream-json',
      // The 2026 CLI requires --verbose with stream-json for the full
      // event surface (system/init + per-turn events). Without it
      // claude collapses to a single `result` line.
      '--verbose',
      // No `--bare`: that flag disables keychain reads, so claude can't see
      // the user's existing OAuth login. The daemon piggybacks on that auth
      // (per README "claude CLI installed and logged in").
      '--permission-mode', 'acceptEdits',
      '--allowedTools', this.cfg.allowedTools,
    ]

    log.info('claude spawn', {
      task_id: input.taskId,
      cwd,
      first: input.isFirst,
      args_preview: args.slice(0, 4).join(' '),
    })

    const proc: ChildProcess = spawn(this.cfg.claudeBin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    if (!proc.stdout || !proc.stderr) {
      throw new Error('claude spawn missing stdio')
    }

    const stderr: string[] = []
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderr.push(text)
      if (this.cfg.verbose) log.debug('claude stderr', { text: text.trim() })
    })

    const lineReader = createInterface({ input: proc.stdout })
    // claude's child MCP servers can hold inherited fds open past claude's
    // own exit, leaving stdout end-of-stream undetected. Force the
    // for-await loop to terminate on proc exit so runClaude actually returns.
    proc.once('exit', () => lineReader.close())
    const at = () => new Date().toISOString()
    let cost: number | undefined
    let stopReason: string | undefined

    const buffer: Record<string, unknown>[] = []
    let flushing: Promise<void> = Promise.resolve()
    const FLUSH_BATCH = 4

    const flush = async () => {
      if (buffer.length === 0) return
      const batch = buffer.splice(0, buffer.length)
      await onEvents(batch)
    }

    const queueFlush = () => {
      flushing = flushing
        .catch(() => undefined)
        .then(() => flush())
        .catch((err) => log.error('flush failed', { err: errString(err) }))
    }

    // `result` is the terminal event in stream-json — once we have it the
    // task is semantically done. claude itself sometimes lingers (MCP server
    // teardown, plugin cleanup), but the daemon shouldn't block on that:
    // it stalls inFlight and starves the next task. Give a short grace then
    // escalate SIGTERM → SIGKILL so stdout closes and the for-await unblocks.
    const RESULT_GRACE_MS = 3_000
    const SIGTERM_GRACE_MS = 5_000
    let teardownArmed = false
    const armTeardown = () => {
      if (teardownArmed) return
      teardownArmed = true
      setTimeout(() => {
        if (proc.exitCode !== null) return
        log.warn('claude still running after result; SIGTERM', { task_id: input.taskId })
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (proc.exitCode !== null) return
          log.warn('claude unresponsive to SIGTERM; SIGKILL', { task_id: input.taskId })
          proc.kill('SIGKILL')
        }, SIGTERM_GRACE_MS).unref()
      }, RESULT_GRACE_MS).unref()
    }

    for await (const line of lineReader) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let evt: StreamMessage
      try {
        evt = JSON.parse(trimmed) as StreamMessage
      } catch {
        log.warn('claude stream-json parse failed', { line: trimmed.slice(0, 200) })
        continue
      }
      const mapped = this.mapEvents(input.taskId, evt, seen, at)
      if (mapped.length > 0) buffer.push(...mapped)
      if (evt.type === 'result') {
        cost = evt.total_cost_usd
        stopReason = evt.stop_reason
        queueFlush()
        await flushing
        armTeardown()
      }
      if (buffer.length >= FLUSH_BATCH) queueFlush()
    }
    queueFlush()
    await flushing

    const exitCode = await new Promise<number>((resolve) => {
      if (proc.exitCode !== null) return resolve(proc.exitCode)
      proc.once('exit', (code) => resolve(code ?? -1))
    })

    // If we already saw `result` the task succeeded; a non-zero exit code
    // here means we (or signals) tore down a lingering claude process.
    // The downstream `result` event is the source of truth, not the OS exit.
    if (exitCode !== 0 && !teardownArmed) {
      log.warn('claude non-zero exit', {
        task_id: input.taskId,
        code: exitCode,
        stderr: stderr.join('').slice(-500),
      })
      return {
        ok: false,
        error: `claude exited ${exitCode}: ${stderr.join('').slice(-200)}`,
      }
    }
    if (exitCode !== 0) {
      log.debug('claude exited non-zero after teardown', {
        task_id: input.taskId,
        code: exitCode,
      })
    }
    return {
      ok: true,
      ...(cost !== undefined ? { cost_usd: cost } : {}),
      ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
    }
  }

  /**
   * Translate one stream-json event into 0+ huozi event lines.
   *
   * Stream-json wraps Anthropic messages: `{type:'assistant', message:{content:[...]}}`
   * where each content block is one of `text` / `thinking` / `tool_use`.
   * Tool results arrive as `{type:'user', message:{content:[{type:'tool_result', ...}]}}`.
   * Top-level `type:'tool_use'` / `'tool_result'` events do NOT exist —
   * an earlier version of this file assumed otherwise and silently
   * dropped every interesting block.
   */
  private mapEvents(
    taskId: string,
    evt: StreamMessage,
    seen: Set<string>,
    at: () => string,
  ): Record<string, unknown>[] {
    const base = () => ({
      id: taskId,
      at: at(),
      by: 'agent:claude-code',
    })

    if (evt.type === 'system' && evt.subtype === 'init') {
      // orchestrator's dispatch event covers this; skip silently.
      return []
    }

    if (evt.type === 'assistant') {
      const content = evt.message?.content
      if (!Array.isArray(content)) return []
      const msgId = typeof evt.message?.id === 'string' ? evt.message.id : null
      const out: Record<string, unknown>[] = []
      let idx = -1
      for (const block of content) {
        idx += 1
        if (!block || typeof block !== 'object') continue
        const t = block['type']
        if (t === 'text') {
          const text = block['text']
          if (typeof text !== 'string' || text.length === 0) continue
          const key = msgId ? `txt:${msgId}:${idx}` : null
          if (key && seen.has(key)) continue
          if (key) seen.add(key)
          out.push({ ...base(), op: 'agent_turn', content: text })
        } else if (t === 'tool_use') {
          const toolUseId = typeof block['id'] === 'string' ? (block['id'] as string) : null
          if (toolUseId && seen.has(`tu:${toolUseId}`)) continue
          if (toolUseId) seen.add(`tu:${toolUseId}`)
          out.push({
            ...base(),
            op: 'tool_use',
            ...(typeof block['name'] === 'string' ? { tool_name: block['name'] } : {}),
            ...(toolUseId ? { tool_use_id: toolUseId } : {}),
            ...(block['input'] !== undefined ? { input: block['input'] } : {}),
          })
        }
        // `thinking` blocks are intentionally dropped — the task timeline
        // is for user/operator review, not model introspection.
      }
      return out
    }

    if (evt.type === 'user') {
      const content = evt.message?.content
      if (!Array.isArray(content)) return []
      const out: Record<string, unknown>[] = []
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block['type'] !== 'tool_result') continue
        const toolUseId =
          typeof block['tool_use_id'] === 'string' ? (block['tool_use_id'] as string) : null
        if (toolUseId && seen.has(`tr:${toolUseId}`)) continue
        if (toolUseId) seen.add(`tr:${toolUseId}`)
        out.push({
          ...base(),
          op: 'tool_result',
          ...(toolUseId ? { tool_use_id: toolUseId } : {}),
          ...(block['is_error'] === true ? { is_error: true } : {}),
          ...(block['content'] !== undefined
            ? { content: previewContent(block['content']) }
            : {}),
        })
      }
      return out
    }

    if (evt.type === 'result') {
      return [
        {
          ...base(),
          op: 'result',
          ...(typeof evt.subtype === 'string' ? { result_kind: evt.subtype } : {}),
          ...(typeof evt.result === 'string' ? { summary: evt.result } : {}),
          ...(typeof evt.total_cost_usd === 'number' ? { cost_usd: evt.total_cost_usd } : {}),
          ...(typeof evt.stop_reason === 'string' ? { stop_reason: evt.stop_reason } : {}),
        },
      ]
    }

    return []
  }
}

function previewContent(content: unknown): unknown {
  // Cap tool_result content size in the mirrored event — the full result
  // is in the local Claude session log if a human needs to dig in.
  const MAX = 8_000
  if (typeof content === 'string') {
    return content.length > MAX ? content.slice(0, MAX) + '…[truncated]' : content
  }
  if (Array.isArray(content)) {
    return content.map((c) => previewContent(c))
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if ('text' in obj && typeof obj.text === 'string') {
      const t = obj.text
      return { ...obj, text: t.length > MAX ? t.slice(0, MAX) + '…[truncated]' : t }
    }
  }
  return content
}

function errString(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
