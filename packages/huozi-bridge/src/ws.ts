/**
 * WebSocket subscription to huozi-cloud workspace commits.
 *
 * Flow (mirrors what the browser does — see Next.js
 * src/app/api/app/ws-ticket/route.ts):
 *   1. POST /events/mint-ticket with Bearer token → get a 60s ticket
 *   2. Open wss://…/events/ws?ticket=<ticket>
 *   3. Receive {type:"commit", paths:[...], author, timestamp}
 *
 * Reconnect strategy: exponential backoff 1s → 30s cap. On reconnect we
 * MISS any commits that landed during the gap; the orchestrator does a
 * `catchUp()` pass after each (re)connect to scan for unfinished work.
 */

import WebSocket from 'ws'
import type { Config } from './config.js'
import { log } from './log.js'

export interface CommitPath {
  path: string
  operation: 'create' | 'edit' | 'write' | 'batch' | 'delete' | 'move' | string
  before_blob_sha: string | null
  after_blob_sha: string | null
  bytes: number
}

export interface CommitAuthor {
  id: string
  type: 'agent' | 'user' | string
}

export interface CommitEvent {
  type: 'commit'
  paths: CommitPath[]
  author: CommitAuthor
  timestamp: number
}

export interface HelloEvent {
  type: 'hello'
}

export type WsEvent = CommitEvent | HelloEvent | { type: string; [k: string]: unknown }

export type WsListener = (event: WsEvent) => void | Promise<void>

interface TicketResponse {
  ok: boolean
  ticket?: string
  expires_in?: number
}

async function mintTicket(cfg: Pick<Config, 'cloudBaseUrl' | 'apiKey'>): Promise<string> {
  const res = await fetch(`${cfg.cloudBaseUrl}/events/mint-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`mint-ticket http ${res.status}`)
  }
  const body = (await res.json()) as TicketResponse
  if (!body.ok || !body.ticket) {
    throw new Error(`mint-ticket returned no ticket: ${JSON.stringify(body)}`)
  }
  return body.ticket
}

export class WsSubscriber {
  private socket: WebSocket | null = null
  private listeners: WsListener[] = []
  private onConnectCb: (() => void | Promise<void>) | null = null
  private closed = false
  private reconnectMs = 1000
  private readonly maxReconnectMs = 30_000

  constructor(private cfg: Config) {}

  onEvent(fn: WsListener): void {
    this.listeners.push(fn)
  }

  onConnect(fn: () => void | Promise<void>): void {
    this.onConnectCb = fn
  }

  start(): void {
    void this.connect()
  }

  close(): void {
    this.closed = true
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
  }

  private async connect(): Promise<void> {
    while (!this.closed) {
      try {
        const ticket = await mintTicket(this.cfg)
        const url = `${this.cfg.wsBaseUrl}/events/ws?ticket=${encodeURIComponent(ticket)}`
        log.info('ws connecting', { url })
        const sock = new WebSocket(url)
        this.socket = sock
        await new Promise<void>((resolve, reject) => {
          sock.once('open', () => {
            log.info('ws open')
            this.reconnectMs = 1000
            resolve()
          })
          sock.once('error', (err: Error) => {
            reject(err)
          })
        })
        if (this.onConnectCb) {
          try {
            await this.onConnectCb()
          } catch (err) {
            log.error('onConnect handler threw', { err: errString(err) })
          }
        }
        await new Promise<void>((resolve) => {
          sock.on('message', (data: Buffer | string) => {
            const text = typeof data === 'string' ? data : data.toString('utf-8')
            this.dispatch(text)
          })
          sock.on('close', () => {
            log.warn('ws closed')
            resolve()
          })
          sock.on('error', (err: Error) => {
            log.warn('ws error', { err: err.message })
            // close will fire and resolve
          })
        })
      } catch (err) {
        log.warn('ws connect failed', { err: errString(err) })
      }
      this.socket = null
      if (this.closed) return
      const delay = this.reconnectMs
      this.reconnectMs = Math.min(this.reconnectMs * 2, this.maxReconnectMs)
      log.info('ws reconnecting', { delay_ms: delay })
      await sleep(delay)
    }
  }

  private dispatch(raw: string): void {
    let parsed: WsEvent
    try {
      parsed = JSON.parse(raw) as WsEvent
    } catch {
      log.debug('ws non-json message', { raw: raw.slice(0, 200) })
      return
    }
    for (const fn of this.listeners) {
      try {
        const r = fn(parsed)
        if (r instanceof Promise) r.catch((err) => log.error('listener threw', { err: errString(err) }))
      } catch (err) {
        log.error('listener threw', { err: errString(err) })
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function errString(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
