/**
 * HuoziSessionDO — persistent `ReadFileState` snapshot per
 * {workspace, principal} session.
 *
 * Read-modify-write pattern:
 *   - Worker GETs the full snapshot at request start
 *   - Runs tools against an in-memory `InMemoryReadFileState`
 *   - PUTs the snapshot back at request end
 *
 * Rationale: our `ReadFileState` interface is synchronous, and round-tripping
 * per `get`/`set` over HTTP would be slow. One load + one save per request
 * is cheap and mirrors CC's in-process semantics (state preserved within a
 * session but not across sessions).
 *
 * Endpoints:
 *   GET  /snapshot          → ReadFileStateSnapshot JSON
 *   POST /snapshot (body=JSON) → { ok: true }
 *   DELETE /snapshot        → clear
 */

import type { ReadFileStateEntry } from '../../types.js'

export interface ReadFileStateSnapshot {
  entries: Record<string, ReadFileStateEntry>
  updatedAt: number
}

export class HuoziSessionDO {
  constructor(
    private state: DurableObjectState,
    private _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'GET' && path === '/snapshot') {
      const snap =
        (await this.state.storage.get<ReadFileStateSnapshot>('snapshot')) ??
        { entries: {}, updatedAt: 0 }
      return Response.json(snap)
    }

    if (request.method === 'POST' && path === '/snapshot') {
      const snap = (await request.json()) as ReadFileStateSnapshot
      await this.state.storage.put('snapshot', snap)
      return Response.json({ ok: true })
    }

    if (request.method === 'DELETE' && path === '/snapshot') {
      await this.state.storage.delete('snapshot')
      return Response.json({ ok: true })
    }

    return new Response('not found', { status: 404 })
  }
}
