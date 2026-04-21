/**
 * In-memory StorageBackend.
 *
 * For PoC, tests, and local dev. Maintains a flat `Map<"workspace:path", FileRecord>`.
 * SHAs are computed via SubtleCrypto (SHA-1 — matches Git blob hash algorithm
 * exactly: `blob <size>\0<content>` prefix).
 *
 * NOT production. Does not persist across restarts. Writes are serialized
 * per workspace via a simple Promise chain; cross-workspace writes run
 * concurrently. Real concurrency protection lives in the production
 * WorkspaceDO.
 */

import type {
  Author,
  BatchWriteArgs,
  BatchWriteItemResult,
  BatchWriteResult,
  CommitPathEntry,
  CommitRecord,
  FileRecord,
  ListCommitsOptions,
  ListCommitsResult,
  ListEntry,
  ListOptions,
  StorageBackend,
  WriteResult,
} from './types.js'
import { StaleError } from './types.js'

export class InMemoryStorage implements StorageBackend {
  private readonly files = new Map<string, FileRecord>()
  /** Per-workspace serialization tail — mimics the WorkspaceDO critical section. */
  private readonly workspaceTails = new Map<string, Promise<unknown>>()
  /** Monotonic commit counter. Fake commit_sha by hex-encoding. */
  private commitCounter = 0
  /** Per-workspace ordered commit log (oldest first). */
  private readonly commits = new Map<string, CommitRecord[]>()
  /** Per-workspace latest commit sha (for parent linkage). */
  private readonly tipCommit = new Map<string, string | null>()

  private key(workspaceId: string, path: string): string {
    return `${workspaceId}:${path}`
  }

  private async runSerialized<T>(
    workspaceId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prior = this.workspaceTails.get(workspaceId) ?? Promise.resolve()
    const next = prior.then(() => fn(), () => fn())
    this.workspaceTails.set(workspaceId, next)
    return next
  }

  private nextCommitSha(): string {
    this.commitCounter += 1
    return this.commitCounter.toString(16).padStart(40, '0')
  }

  private appendCommit(record: CommitRecord): void {
    const arr = this.commits.get(record.workspaceId) ?? []
    arr.push(record)
    this.commits.set(record.workspaceId, arr)
    this.tipCommit.set(record.workspaceId, record.commit_sha)
  }

  async readFile(
    workspaceId: string,
    path: string,
    _signal?: AbortSignal,
  ): Promise<FileRecord | null> {
    return this.files.get(this.key(workspaceId, path)) ?? null
  }

  async writeFile(args: {
    workspaceId: string
    path: string
    content: Uint8Array
    author: Author
    parent_sha?: string | null
    message?: string
    signal?: AbortSignal
  }): Promise<WriteResult> {
    return this.runSerialized(args.workspaceId, async () => {
      const key = this.key(args.workspaceId, args.path)
      const existing = this.files.get(key) ?? null

      if (args.parent_sha !== undefined) {
        const currentSha = existing?.blob_sha ?? null
        if (args.parent_sha !== currentSha) {
          throw new StaleError({
            current_blob_sha: currentSha,
            expected_parent_sha: args.parent_sha,
          })
        }
      }

      const blob_sha = await gitBlobSha1(args.content)
      const record: FileRecord = {
        workspaceId: args.workspaceId,
        path: args.path,
        content: args.content,
        blob_sha,
        size: args.content.length,
        mtime: Date.now(),
        encoding: existing?.encoding,
        lineEndings: existing?.lineEndings,
      }
      this.files.set(key, record)

      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null

      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp: record.mtime,
        message: args.message ?? `${existing ? 'update' : 'create'}: ${args.path}`,
        paths: [
          {
            path: args.path,
            operation: existing ? 'update' : 'create',
            before_blob_sha: existing?.blob_sha ?? null,
            after_blob_sha: blob_sha,
            additions: 0,
            deletions: 0,
          },
        ],
      })

      return {
        record,
        operation: existing ? 'update' : 'create',
        commit_sha,
      }
    })
  }

  async writeBatch(args: BatchWriteArgs): Promise<BatchWriteResult> {
    const allOrNothing = args.allOrNothing ?? true
    return this.runSerialized(args.workspaceId, async () => {
      // Phase 1: validate staleness for every edit against CURRENT state.
      // We read once here; since we hold the workspace lock, nothing changes
      // underneath us.
      const prepared: Array<{
        edit: BatchWriteArgs['edits'][number]
        existing: FileRecord | null
        staleError: StaleError | null
      }> = []

      for (const edit of args.edits) {
        const existing =
          this.files.get(this.key(args.workspaceId, edit.path)) ?? null
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
        prepared.push({ edit, existing, staleError })
      }

      const anyStale = prepared.some((p) => p.staleError)

      if (allOrNothing && anyStale) {
        const results: BatchWriteItemResult[] = prepared.map((p) => ({
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
        }))
        return { aborted: true, commit_sha: null, results }
      }

      // Phase 2: apply writes. Collect per-file commit entries.
      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null
      const timestamp = Date.now()
      const pathEntries: CommitPathEntry[] = []
      const results: BatchWriteItemResult[] = []

      for (const p of prepared) {
        if (p.staleError) {
          results.push({
            path: p.edit.path,
            success: false,
            error: { code: 'STALE', message: p.staleError.message },
          })
          continue
        }

        const blob_sha = await gitBlobSha1(p.edit.content)
        const record: FileRecord = {
          workspaceId: args.workspaceId,
          path: p.edit.path,
          content: p.edit.content,
          blob_sha,
          size: p.edit.content.length,
          mtime: timestamp,
          encoding: p.existing?.encoding,
          lineEndings: p.existing?.lineEndings,
        }
        this.files.set(this.key(args.workspaceId, p.edit.path), record)

        const entry: CommitPathEntry = {
          path: p.edit.path,
          operation: p.existing ? 'update' : 'create',
          before_blob_sha: p.existing?.blob_sha ?? null,
          after_blob_sha: blob_sha,
          additions: p.edit.additions ?? 0,
          deletions: p.edit.deletions ?? 0,
        }
        pathEntries.push(entry)
        results.push({ path: p.edit.path, success: true, record, entry })
      }

      // If we reached here with zero successful writes (can happen in
      // allOrNothing=false mode when all edits happened to be stale), skip
      // commit creation.
      if (pathEntries.length === 0) {
        return { aborted: false, commit_sha: null, results }
      }

      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp,
        message:
          args.message ??
          `batch: ${pathEntries.length} file${pathEntries.length === 1 ? '' : 's'}`,
        paths: pathEntries,
      })

      return {
        aborted: false,
        commit_sha,
        results,
      }
    })
  }

  async listFiles(
    workspaceId: string,
    opts?: ListOptions,
    _signal?: AbortSignal,
  ): Promise<ListEntry[]> {
    const prefix = opts?.prefix ?? ''
    const limit = opts?.limit
    const prefixKey = `${workspaceId}:`
    const out: ListEntry[] = []
    for (const [k, v] of this.files) {
      if (!k.startsWith(prefixKey)) continue
      if (prefix && !v.path.startsWith(prefix)) continue
      out.push({
        path: v.path,
        blob_sha: v.blob_sha,
        size: v.size,
        mtime: v.mtime,
      })
    }
    out.sort((a, b) => a.path.localeCompare(b.path))
    return limit !== undefined ? out.slice(0, limit) : out
  }

  async searchFts(
    workspaceId: string,
    literal: string,
    opts?: { limit?: number; prefix?: string },
    _signal?: AbortSignal,
  ): Promise<string[]> {
    // In-memory: full scan, substring match on decoded content.
    // Not production — real backend uses FTS5.
    const prefix = opts?.prefix ?? ''
    const limit = opts?.limit ?? 10000
    const prefixKey = `${workspaceId}:`
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const out: string[] = []

    for (const [k, v] of this.files) {
      if (!k.startsWith(prefixKey)) continue
      if (prefix && !v.path.startsWith(prefix)) continue
      try {
        const text = decoder.decode(v.content)
        if (text.includes(literal)) out.push(v.path)
      } catch {
        // skip undecodable
      }
      if (out.length >= limit) break
    }
    out.sort((a, b) => a.localeCompare(b))
    return out
  }

  async listCommits(
    workspaceId: string,
    opts?: ListCommitsOptions,
    _signal?: AbortSignal,
  ): Promise<ListCommitsResult> {
    const allForWorkspace = this.commits.get(workspaceId) ?? []
    const limit = Math.min(opts?.limit ?? 20, 100)

    // Filter by file_path if provided.
    let filtered = opts?.file_path
      ? allForWorkspace.filter((c) =>
          c.paths.some((p) => p.path === opts.file_path),
        )
      : allForWorkspace.slice()

    // Sort timestamp desc; stable tie-break on commit_sha desc so
    // same-millisecond commits get deterministic order.
    filtered.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
      return a.commit_sha < b.commit_sha ? 1 : -1
    })

    // Pagination cursor — `before` means "strictly older than this sha".
    if (opts?.before) {
      const idx = filtered.findIndex((c) => c.commit_sha === opts.before)
      if (idx >= 0) filtered = filtered.slice(idx + 1)
    }

    const page = filtered.slice(0, limit)
    const hasMore = filtered.length > limit
    return {
      commits: page,
      has_more: hasMore,
      next_before: hasMore ? page[page.length - 1]?.commit_sha : undefined,
    }
  }

  /**
   * Test seed helper. Not part of the public StorageBackend interface.
   */
  async seed(args: {
    workspaceId: string
    path: string
    content: string | Uint8Array
  }): Promise<FileRecord> {
    const bytes =
      typeof args.content === 'string'
        ? new TextEncoder().encode(args.content)
        : args.content
    const result = await this.writeFile({
      workspaceId: args.workspaceId,
      path: args.path,
      content: bytes,
      author: { id: 'seed', type: 'system' },
    })
    return result.record
  }

  /** Test helper: bulk-remove everything. */
  clear(): void {
    this.files.clear()
    this.workspaceTails.clear()
    this.commits.clear()
    this.tipCommit.clear()
    this.commitCounter = 0
  }
}

/**
 * Compute a Git-compatible blob SHA-1.
 *
 * Git's blob identity = SHA-1 of `"blob " + <size> + "\0" + <content>`.
 * Using Git's algorithm means our blob_sha is identical to what
 * isomorphic-git would produce for the same content — so when we migrate the
 * in-memory backend to Git-backed R2 storage, existing cached staleness
 * values in ReadFileState stay valid.
 */
async function gitBlobSha1(content: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${content.length}\0`)
  const combined = new Uint8Array(header.length + content.length)
  combined.set(header, 0)
  combined.set(content, header.length)

  const digest = await crypto.subtle.digest('SHA-1', combined)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}
