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
  DeletePrefixResult,
  DeleteResult,
  FileRecord,
  ListCommitsOptions,
  ListCommitsResult,
  ListEntry,
  ListOptions,
  RenamePrefixResult,
  RenameResult,
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

  // ── Delete / rename ──────────────────────────────────────────────────

  async deleteFile(args: {
    workspaceId: string
    path: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<DeleteResult> {
    return this.runSerialized(args.workspaceId, async () => {
      const key = this.key(args.workspaceId, args.path)
      const existing = this.files.get(key)
      if (!existing) {
        return { ok: false as const, error: 'not_found' as const }
      }

      this.files.delete(key)

      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null
      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp: Date.now(),
        message: args.message ?? `delete: ${args.path}`,
        paths: [
          {
            path: args.path,
            operation: 'delete',
            before_blob_sha: existing.blob_sha,
            after_blob_sha: null,
            additions: 0,
            deletions: 0,
          },
        ],
      })

      return {
        ok: true as const,
        commit_sha,
        path: args.path,
        deleted_blob_sha: existing.blob_sha,
      }
    })
  }

  async deletePrefix(args: {
    workspaceId: string
    prefix: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<DeletePrefixResult> {
    if (!args.prefix || args.prefix === '/') {
      return { ok: false as const, error: 'invalid_prefix' as const, message: 'prefix cannot be empty or root' }
    }
    return this.runSerialized(args.workspaceId, async () => {
      // Match both `<prefix>/...` and the exact path (in case prefix IS a file).
      const normalizedPrefix = args.prefix.endsWith('/')
        ? args.prefix
        : args.prefix + '/'

      const toDelete: FileRecord[] = []
      for (const [key, record] of this.files) {
        if (record.workspaceId !== args.workspaceId) continue
        if (
          record.path === args.prefix ||
          record.path.startsWith(normalizedPrefix)
        ) {
          toDelete.push(record)
        }
        // keep `key` referenced to satisfy linter noise
        void key
      }

      if (toDelete.length === 0) {
        return {
          ok: true as const,
          commit_sha: null,
          prefix: args.prefix,
          deleted_paths: [],
        }
      }

      const entries: CommitPathEntry[] = []
      for (const rec of toDelete) {
        this.files.delete(this.key(args.workspaceId, rec.path))
        entries.push({
          path: rec.path,
          operation: 'delete',
          before_blob_sha: rec.blob_sha,
          after_blob_sha: null,
          additions: 0,
          deletions: 0,
        })
      }

      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null
      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp: Date.now(),
        message:
          args.message ?? `delete ${toDelete.length} files under ${args.prefix}`,
        paths: entries,
      })

      return {
        ok: true as const,
        commit_sha,
        prefix: args.prefix,
        deleted_paths: toDelete.map((r) => r.path),
      }
    })
  }

  async renamePath(args: {
    workspaceId: string
    from: string
    to: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<RenameResult> {
    return this.runSerialized(args.workspaceId, async () => {
      const fromKey = this.key(args.workspaceId, args.from)
      const toKey = this.key(args.workspaceId, args.to)
      const existing = this.files.get(fromKey)
      if (!existing) {
        return { ok: false as const, error: 'not_found' as const }
      }
      if (this.files.has(toKey)) {
        return { ok: false as const, error: 'target_exists' as const }
      }
      const moved: FileRecord = { ...existing, path: args.to, mtime: Date.now() }
      this.files.delete(fromKey)
      this.files.set(toKey, moved)

      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null
      // Encode a rename as paired delete(old) + create(new) with same
      // blob_sha. UIs can detect the pair.
      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp: moved.mtime,
        message: args.message ?? `rename ${args.from} → ${args.to}`,
        paths: [
          {
            path: args.from,
            operation: 'delete',
            before_blob_sha: existing.blob_sha,
            after_blob_sha: null,
            additions: 0,
            deletions: 0,
          },
          {
            path: args.to,
            operation: 'create',
            before_blob_sha: null,
            after_blob_sha: existing.blob_sha,
            additions: 0,
            deletions: 0,
          },
        ],
      })

      return {
        ok: true as const,
        commit_sha,
        from: args.from,
        to: args.to,
        blob_sha: existing.blob_sha,
      }
    })
  }

  async renamePrefix(args: {
    workspaceId: string
    fromPrefix: string
    toPrefix: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<RenamePrefixResult> {
    if (!args.fromPrefix || args.fromPrefix === '/') {
      return { ok: false as const, error: 'invalid_prefix' as const, message: 'fromPrefix cannot be empty or root' }
    }
    const fromPrefix = args.fromPrefix.endsWith('/')
      ? args.fromPrefix
      : args.fromPrefix + '/'
    const toPrefix = args.toPrefix.endsWith('/')
      ? args.toPrefix
      : args.toPrefix + '/'

    return this.runSerialized(args.workspaceId, async () => {
      const toMove: FileRecord[] = []
      for (const record of this.files.values()) {
        if (record.workspaceId !== args.workspaceId) continue
        if (record.path.startsWith(fromPrefix)) toMove.push(record)
      }

      // Check target collisions before doing anything.
      for (const rec of toMove) {
        const newPath = toPrefix + rec.path.slice(fromPrefix.length)
        if (this.files.has(this.key(args.workspaceId, newPath))) {
          return {
            ok: false as const,
            error: 'target_exists' as const,
            message: `${newPath} already exists`,
          }
        }
      }

      if (toMove.length === 0) {
        return {
          ok: true as const,
          commit_sha: null,
          from_prefix: args.fromPrefix,
          to_prefix: args.toPrefix,
          moved_paths: [],
        }
      }

      const entries: CommitPathEntry[] = []
      const pairs: Array<{ from: string; to: string }> = []
      const now = Date.now()
      for (const rec of toMove) {
        const newPath = toPrefix + rec.path.slice(fromPrefix.length)
        this.files.delete(this.key(args.workspaceId, rec.path))
        this.files.set(this.key(args.workspaceId, newPath), {
          ...rec,
          path: newPath,
          mtime: now,
        })
        entries.push({
          path: rec.path,
          operation: 'delete',
          before_blob_sha: rec.blob_sha,
          after_blob_sha: null,
          additions: 0,
          deletions: 0,
        })
        entries.push({
          path: newPath,
          operation: 'create',
          before_blob_sha: null,
          after_blob_sha: rec.blob_sha,
          additions: 0,
          deletions: 0,
        })
        pairs.push({ from: rec.path, to: newPath })
      }

      const commit_sha = this.nextCommitSha()
      const parent_sha = this.tipCommit.get(args.workspaceId) ?? null
      this.appendCommit({
        commit_sha,
        parent_sha,
        workspaceId: args.workspaceId,
        author: args.author,
        timestamp: now,
        message:
          args.message ?? `rename ${toMove.length} files: ${args.fromPrefix} → ${args.toPrefix}`,
        paths: entries,
      })

      return {
        ok: true as const,
        commit_sha,
        from_prefix: args.fromPrefix,
        to_prefix: args.toPrefix,
        moved_paths: pairs,
      }
    })
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
