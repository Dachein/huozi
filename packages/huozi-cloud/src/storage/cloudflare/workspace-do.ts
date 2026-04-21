/**
 * HuoziWorkspaceDO — the "workspace critical section" Durable Object.
 *
 * Every write for a given workspace_id funnels through one DO instance. DO
 * processes requests serially by default, which gives us the atomicity CC's
 * FileEditTool relies on (cc:FileEditTool.ts:443 — "avoid async operations
 * between staleness check and writeTextContent").
 *
 * This DO's internal SQLite stores the commit chain HEAD pointer per
 * workspace (one row: tip commit_sha); files_current + commits + commit_paths
 * live in the outer D1 database so cross-workspace queries work.
 *
 * Endpoints (POST JSON body):
 *   /write-file   → WriteResult JSON
 *   /write-batch  → BatchWriteResult JSON
 */

import type {
  Author,
  BatchWriteArgs,
  BatchWriteItemResult,
  BatchWriteResult,
  CommitPathEntry,
  CommitRecord,
  FileRecord,
  WriteResult,
} from '../types.js'
import { StaleError } from '../types.js'
import type { HuoziCloudflareBindings } from './bindings.js'
import { blobKey, gitBlobSha1 } from './sha.js'

interface RpcWriteFile {
  method: 'write-file'
  workspaceId: string
  path: string
  contentBase64: string
  author: Author
  parent_sha?: string | null
  message?: string
}

interface RpcWriteBatch {
  method: 'write-batch'
  workspaceId: string
  edits: Array<{
    path: string
    contentBase64: string
    parent_sha?: string | null
    additions?: number
    deletions?: number
  }>
  author: Author
  message?: string
  allOrNothing?: boolean
}

type Rpc = RpcWriteFile | RpcWriteBatch

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * FTS5 row content cap. Files up to this size get indexed; above, we skip
 * FTS indexing — those files won't be findable by grep-with-literal, but
 * remain fully readable/editable.
 *
 * 4 MB chosen to match the Read tool's inline-binary threshold: anything
 * below that is rendered/edited inline anyway, so FTS coverage matches the
 * "first-class file" size envelope.
 *
 * Tradeoff: 4 MB rows inflate D1 FTS5 storage and slightly slow INSERT. For
 * v1 expected workloads (docs, code, small data), impact is small.
 */
const FTS_MAX_BYTES = 4 * 1024 * 1024

/**
 * Try to decode bytes as UTF-8 for FTS5 indexing. Returns null when content
 * is clearly binary or exceeds the cap.
 */
function decodeForFts(bytes: Uint8Array): string | null {
  if (bytes.length > FTS_MAX_BYTES) return null
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

/**
 * Event envelope broadcast on each commit. Filtered per-WS by scope before
 * being sent — the scope filter happens inside the DO since only the DO
 * knows which WS is subscribed to which scope.
 */
interface CommitEvent {
  type: 'commit'
  workspace_id: string
  commit_sha: string
  parent_sha: string | null
  timestamp: number
  author: Author
  message: string
  operation: 'create' | 'update' | 'edit' | 'write' | 'delete' | 'batch' | 'revert'
  paths: Array<{
    path: string
    operation: string
    before_blob_sha: string | null
    after_blob_sha: string | null
    /** New file size in bytes (after this commit). */
    bytes: number
  }>
}

/**
 * Per-WebSocket tags stored by state.acceptWebSocket, used for scope-filtered
 * broadcast. Tags are strings in the hibernation API.
 *
 *   tags[0] = principalId            (just for debugging / future fanout)
 *   tags[1] = scopePath ?? ''        ('' means no scope — sees everything)
 */
type WsTags = [principalId: string, scopePath: string]

export class HuoziWorkspaceDO {
  constructor(
    private state: DurableObjectState,
    private env: HuoziCloudflareBindings,
  ) {}

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade path — dispatched from the top-level Worker after
    // the ticket has been validated and consumed.
    if (request.headers.get('upgrade') === 'websocket') {
      return this.acceptUpgrade(request)
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 })
    }
    const rpc = (await request.json()) as Rpc
    try {
      if (rpc.method === 'write-file') {
        const result = await this.writeFile(rpc)
        return Response.json(serializeWrite(result))
      }
      if (rpc.method === 'write-batch') {
        const result = await this.writeBatch(rpc)
        return Response.json(serializeBatch(result))
      }
      return new Response('unknown method', { status: 400 })
    } catch (e) {
      if (e instanceof StaleError) {
        return Response.json(
          {
            error: 'stale',
            current_blob_sha: e.current_blob_sha,
            expected_parent_sha: e.expected_parent_sha,
            message: e.message,
          },
          { status: 409 },
        )
      }
      const message = e instanceof Error ? e.message : String(e)
      return Response.json({ error: 'server_error', message }, { status: 500 })
    }
  }

  // ── WebSocket hibernation API ────────────────────────────────────────
  //
  // With acceptWebSocket+getWebSockets, the DO can go idle between writes
  // and still deliver broadcasts when a commit lands. This keeps event
  // delivery cheap even for workspaces with many long-lived subscribers.

  private async acceptUpgrade(request: Request): Promise<Response> {
    const workspaceId = request.headers.get('X-Huozi-Workspace') ?? ''
    const principalId = request.headers.get('X-Huozi-Principal-Id') ?? ''
    const scopePath = request.headers.get('X-Huozi-Scope-Path') ?? ''

    // Remember the workspaceId so broadcast envelopes can echo it back (and
    // so a cold DO that only sees commits via write-file knows its own id).
    if (workspaceId) {
      await this.state.storage.put('self-workspace-id', workspaceId)
    }

    const { 0: client, 1: server } = new WebSocketPair()

    // Tags are serialized by the DO runtime as metadata so getTags() returns
    // the same strings after hibernation. Keep them small.
    const tags: WsTags = [principalId, scopePath]
    this.state.acceptWebSocket(server, tags)

    // Send a one-shot hello so the browser can set "online" immediately and
    // tell the user which workspace the stream is bound to.
    server.send(
      JSON.stringify({
        type: 'hello',
        workspace_id: workspaceId,
        principal_id: principalId,
        scope_path: scopePath || null,
        ts: Date.now(),
      }),
    )

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * Hibernation API callback. We don't expect clients to send anything;
   * keep a tiny ping/pong for keepalive and ignore the rest.
   */
  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    if (typeof msg === 'string' && msg === 'ping') {
      try {
        ws.send('pong')
      } catch {
        /* ignore */
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, 'closing')
    } catch {
      /* ignore */
    }
  }

  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> {
    // Hibernation API will clean up on its own.
  }

  /**
   * Broadcast a CommitEvent to every WebSocket whose scope overlaps at least
   * one of the paths in the commit. No-op when there are no subscribers.
   */
  private broadcastCommit(event: CommitEvent): void {
    let sockets: WebSocket[]
    try {
      sockets = this.state.getWebSockets()
    } catch {
      return
    }
    if (sockets.length === 0) return

    for (const ws of sockets) {
      let tags: string[]
      try {
        tags = this.state.getTags(ws)
      } catch {
        continue
      }
      const scope = tags[1] ?? ''

      const visible = scope
        ? event.paths.filter(
            (p) => p.path === scope || p.path.startsWith(scope + '/'),
          )
        : event.paths
      if (visible.length === 0) continue

      const payload =
        visible.length === event.paths.length
          ? event
          : { ...event, paths: visible }
      try {
        ws.send(JSON.stringify(payload))
      } catch {
        // Broken socket — hibernation API will clean up via webSocketError.
      }
    }
  }

  // ── Internal helpers (all run serialized thanks to DO semantics) ─────

  /** Return `{ blob_sha, size }` of the current file or null. */
  private async currentFileMeta(
    workspaceId: string,
    path: string,
  ): Promise<{ blob_sha: string; size: number } | null> {
    const row = await this.env.DB.prepare(
      'SELECT blob_sha, size FROM files_current WHERE workspace_id = ? AND path = ?',
    )
      .bind(workspaceId, path)
      .first<{ blob_sha: string; size: number }>()
    return row ?? null
  }

  /** Current tip commit_sha for a workspace (from DO storage). */
  private async currentTip(workspaceId: string): Promise<string | null> {
    return (
      (await this.state.storage.get<string>(`tip:${workspaceId}`)) ?? null
    )
  }

  private async setTip(workspaceId: string, sha: string): Promise<void> {
    await this.state.storage.put(`tip:${workspaceId}`, sha)
  }

  /**
   * Generate a commit sha. In v1 we use a monotonic counter stored in DO.
   * Production later swaps for real Git commit hashes (isomorphic-git) with
   * the same 40-char format.
   */
  private async nextCommitSha(): Promise<string> {
    const key = 'commit-counter'
    const n =
      ((await this.state.storage.get<number>(key)) ?? 0) + 1
    await this.state.storage.put(key, n)
    return n.toString(16).padStart(40, '0')
  }

  private async writeFile(rpc: RpcWriteFile): Promise<WriteResult> {
    const bytes = decodeBase64(rpc.contentBase64)

    const existing = await this.currentFileMeta(rpc.workspaceId, rpc.path)
    if (rpc.parent_sha !== undefined) {
      const currentSha = existing?.blob_sha ?? null
      if (rpc.parent_sha !== currentSha) {
        throw new StaleError({
          current_blob_sha: currentSha,
          expected_parent_sha: rpc.parent_sha,
        })
      }
    }

    const blob_sha = await gitBlobSha1(bytes)

    // Write blob to R2 (idempotent — same sha overwrite is fine).
    await this.env.BLOBS.put(blobKey(blob_sha), bytes)

    const now = Date.now()
    const parent = await this.currentTip(rpc.workspaceId)
    const commit_sha = await this.nextCommitSha()
    const operation: 'create' | 'update' = existing ? 'update' : 'create'

    const pathEntry: CommitPathEntry = {
      path: rpc.path,
      operation,
      before_blob_sha: existing?.blob_sha ?? null,
      after_blob_sha: blob_sha,
      additions: 0,
      deletions: 0,
    }

    // Update D1 in a batch for atomicity.
    const stmts: D1PreparedStatement[] = [
      this.env.DB.prepare(
        `INSERT INTO files_current (workspace_id, path, blob_sha, size, mtime)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, path) DO UPDATE SET
           blob_sha = excluded.blob_sha,
           size = excluded.size,
           mtime = excluded.mtime`,
      ).bind(rpc.workspaceId, rpc.path, blob_sha, bytes.length, now),
      this.env.DB.prepare(
        `INSERT INTO commits (workspace_id, commit_sha, parent_sha, author_id, author_type, message, timestamp, paths_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        rpc.workspaceId,
        commit_sha,
        parent,
        rpc.author.id,
        rpc.author.type,
        rpc.message ?? `${operation}: ${rpc.path}`,
        now,
        JSON.stringify([pathEntry]),
      ),
      this.env.DB.prepare(
        `INSERT INTO commit_paths (workspace_id, commit_sha, path, operation, before_blob_sha, after_blob_sha, additions, deletions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        rpc.workspaceId,
        commit_sha,
        rpc.path,
        operation,
        pathEntry.before_blob_sha,
        pathEntry.after_blob_sha,
        pathEntry.additions,
        pathEntry.deletions,
      ),
      // FTS5 maintenance — delete any prior row for this (workspace,path),
      // then insert the current content. Virtual tables don't support
      // UPSERT, hence the two-step.
      this.env.DB.prepare(
        `DELETE FROM file_fts WHERE workspace_id = ? AND path = ?`,
      ).bind(rpc.workspaceId, rpc.path),
    ]
    const indexable = decodeForFts(bytes)
    if (indexable !== null) {
      stmts.push(
        this.env.DB.prepare(
          `INSERT INTO file_fts (workspace_id, path, content) VALUES (?, ?, ?)`,
        ).bind(rpc.workspaceId, rpc.path, indexable),
      )
    }
    await this.env.DB.batch(stmts)

    await this.setTip(rpc.workspaceId, commit_sha)

    const record: FileRecord = {
      workspaceId: rpc.workspaceId,
      path: rpc.path,
      content: bytes,
      blob_sha,
      size: bytes.length,
      mtime: now,
    }

    // Broadcast to any subscribed WebSockets. Fire-and-forget; best-effort.
    this.broadcastCommit({
      type: 'commit',
      workspace_id: rpc.workspaceId,
      commit_sha,
      parent_sha: parent,
      timestamp: now,
      author: rpc.author,
      message: rpc.message ?? `${operation}: ${rpc.path}`,
      operation,
      paths: [
        {
          path: rpc.path,
          operation,
          before_blob_sha: pathEntry.before_blob_sha,
          after_blob_sha: pathEntry.after_blob_sha,
          bytes: bytes.length,
        },
      ],
    })

    return {
      record,
      operation,
      commit_sha,
    }
  }

  private async writeBatch(rpc: RpcWriteBatch): Promise<BatchWriteResult> {
    const allOrNothing = rpc.allOrNothing ?? true

    const prepared: Array<{
      edit: (typeof rpc.edits)[number]
      bytes: Uint8Array
      existing: { blob_sha: string; size: number } | null
      staleError: StaleError | null
    }> = []

    for (const edit of rpc.edits) {
      const bytes = decodeBase64(edit.contentBase64)
      const existing = await this.currentFileMeta(rpc.workspaceId, edit.path)
      let staleError: StaleError | null = null
      if (edit.parent_sha !== undefined) {
        const current = existing?.blob_sha ?? null
        if (edit.parent_sha !== current) {
          staleError = new StaleError({
            current_blob_sha: current,
            expected_parent_sha: edit.parent_sha,
          })
        }
      }
      prepared.push({ edit, bytes, existing, staleError })
    }

    const anyStale = prepared.some((p) => p.staleError)
    if (allOrNothing && anyStale) {
      return {
        aborted: true,
        commit_sha: null,
        results: prepared.map((p) => ({
          path: p.edit.path,
          success: false,
          ...(p.staleError
            ? {
                error: {
                  code: 'STALE',
                  message: p.staleError.message,
                },
              }
            : {}),
        })),
      }
    }

    const now = Date.now()
    const parent = await this.currentTip(rpc.workspaceId)
    const commit_sha = await this.nextCommitSha()
    const pathEntries: CommitPathEntry[] = []
    const results: BatchWriteItemResult[] = []

    // Stale items first — no R2 work for them.
    const staleItems = prepared.filter((p) => p.staleError)
    for (const p of staleItems) {
      results.push({
        path: p.edit.path,
        success: false,
        error: { code: 'STALE', message: p.staleError!.message },
      })
    }

    // Non-stale: compute SHAs and upload to R2 **in parallel**.
    // Previously this was a sequential await per file — for a 20-file batch
    // that multiplied out to > 30s. Parallel uploads bring it to the slowest
    // single put, dominated by CF-internal latency.
    const live = prepared.filter((p) => !p.staleError)
    const uploaded = await Promise.all(
      live.map(async (p) => {
        const sha = await gitBlobSha1(p.bytes)
        await this.env.BLOBS.put(blobKey(sha), p.bytes)
        return { ...p, sha }
      }),
    )

    for (const p of uploaded) {
      const entry: CommitPathEntry = {
        path: p.edit.path,
        operation: p.existing ? 'update' : 'create',
        before_blob_sha: p.existing?.blob_sha ?? null,
        after_blob_sha: p.sha,
        additions: p.edit.additions ?? 0,
        deletions: p.edit.deletions ?? 0,
      }
      pathEntries.push(entry)

      const record: FileRecord = {
        workspaceId: rpc.workspaceId,
        path: p.edit.path,
        content: p.bytes,
        blob_sha: p.sha,
        size: p.bytes.length,
        mtime: now,
      }
      results.push({
        path: p.edit.path,
        success: true,
        record,
        entry,
      })
    }

    if (pathEntries.length === 0) {
      return { aborted: false, commit_sha: null, results }
    }

    // Build the D1 batch: files_current upserts + commit row + commit_paths
    // rows + FTS5 maintenance.
    const stmts: D1PreparedStatement[] = []
    for (const e of pathEntries) {
      stmts.push(
        this.env.DB.prepare(
          `INSERT INTO files_current (workspace_id, path, blob_sha, size, mtime)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id, path) DO UPDATE SET
             blob_sha = excluded.blob_sha,
             size = excluded.size,
             mtime = excluded.mtime`,
        ).bind(
          rpc.workspaceId,
          e.path,
          e.after_blob_sha,
          results.find((r) => r.path === e.path)?.record?.size ?? 0,
          now,
        ),
      )
    }
    stmts.push(
      this.env.DB.prepare(
        `INSERT INTO commits (workspace_id, commit_sha, parent_sha, author_id, author_type, message, timestamp, paths_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        rpc.workspaceId,
        commit_sha,
        parent,
        rpc.author.id,
        rpc.author.type,
        rpc.message ?? `batch: ${pathEntries.length} files`,
        now,
        JSON.stringify(pathEntries),
      ),
    )
    for (const e of pathEntries) {
      stmts.push(
        this.env.DB.prepare(
          `INSERT INTO commit_paths (workspace_id, commit_sha, path, operation, before_blob_sha, after_blob_sha, additions, deletions)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          rpc.workspaceId,
          commit_sha,
          e.path,
          e.operation,
          e.before_blob_sha,
          e.after_blob_sha,
          e.additions,
          e.deletions,
        ),
      )
    }
    // FTS5 maintenance for each path in the batch
    for (const p of uploaded) {
      stmts.push(
        this.env.DB.prepare(
          `DELETE FROM file_fts WHERE workspace_id = ? AND path = ?`,
        ).bind(rpc.workspaceId, p.edit.path),
      )
      const indexable = decodeForFts(p.bytes)
      if (indexable !== null) {
        stmts.push(
          this.env.DB.prepare(
            `INSERT INTO file_fts (workspace_id, path, content) VALUES (?, ?, ?)`,
          ).bind(rpc.workspaceId, p.edit.path, indexable),
        )
      }
    }

    await this.env.DB.batch(stmts)
    await this.setTip(rpc.workspaceId, commit_sha)

    this.broadcastCommit({
      type: 'commit',
      workspace_id: rpc.workspaceId,
      commit_sha,
      parent_sha: parent,
      timestamp: now,
      author: rpc.author,
      message: rpc.message ?? `batch: ${pathEntries.length} files`,
      operation: 'batch',
      paths: pathEntries.map((e) => {
        const r = results.find((x) => x.path === e.path)
        return {
          path: e.path,
          operation: e.operation,
          before_blob_sha: e.before_blob_sha,
          after_blob_sha: e.after_blob_sha,
          bytes: r?.record?.size ?? 0,
        }
      }),
    })

    return {
      aborted: false,
      commit_sha,
      results,
    }
  }
}

// ── Wire serialization helpers ───────────────────────────────────────────
// DOs talk JSON-over-HTTP. We can't put Uint8Array in JSON directly, so
// blobs travel as base64 to/from the DO. Client-side ser/de mirrors this.

function serializeWrite(r: WriteResult): unknown {
  return {
    operation: r.operation,
    commit_sha: r.commit_sha,
    record: {
      ...r.record,
      content: encodeBase64(r.record.content),
    },
  }
}

function serializeBatch(r: BatchWriteResult): unknown {
  return {
    aborted: r.aborted,
    commit_sha: r.commit_sha,
    results: r.results.map((x) => ({
      path: x.path,
      success: x.success,
      ...(x.error ? { error: x.error } : {}),
      ...(x.record
        ? {
            record: { ...x.record, content: encodeBase64(x.record.content) },
          }
        : {}),
      ...(x.entry ? { entry: x.entry } : {}),
    })),
  }
}

// Exported for the client (CloudflareStorage) to decode responses.
export function deserializeWrite(payload: unknown): WriteResult {
  const p = payload as {
    operation: 'create' | 'update'
    commit_sha: string
    record: FileRecord & { content: string }
  }
  return {
    operation: p.operation,
    commit_sha: p.commit_sha,
    record: {
      ...p.record,
      content: decodeBase64(p.record.content as unknown as string),
    },
  }
}

export function deserializeBatch(payload: unknown): BatchWriteResult {
  const p = payload as {
    aborted: boolean
    commit_sha: string | null
    results: Array<{
      path: string
      success: boolean
      error?: { code: string; message: string }
      record?: FileRecord & { content: string }
      entry?: CommitPathEntry
    }>
  }
  return {
    aborted: p.aborted,
    commit_sha: p.commit_sha,
    results: p.results.map((r) => ({
      path: r.path,
      success: r.success,
      ...(r.error ? { error: r.error } : {}),
      ...(r.record
        ? {
            record: {
              ...r.record,
              content: decodeBase64(
                r.record.content as unknown as string,
              ),
            },
          }
        : {}),
      ...(r.entry ? { entry: r.entry } : {}),
    })),
  }
}

// Suppress unused-variable warning on imports used only in types
export type { CommitRecord }
