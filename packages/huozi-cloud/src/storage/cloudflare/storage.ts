/**
 * CloudflareStorage — `StorageBackend` implementation backed by R2 + D1 + WorkspaceDO.
 *
 * Division of responsibility:
 *   - readFile       : R2 + D1 read (no DO round-trip needed)
 *   - listFiles      : D1 query (prefix LIKE)
 *   - listCommits    : D1 query with optional file_path filter via commit_paths join
 *   - writeFile      : forward to WorkspaceDO (critical section)
 *   - writeBatch     : forward to WorkspaceDO
 *
 * Reads talk to D1 and R2 in parallel where possible (sha from D1 → bytes
 * from R2). The WorkspaceDO holds the tip-of-chain pointer and serializes all
 * writes for a workspace.
 */

import type {
  Author,
  BatchWriteArgs,
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
} from '../types.js'
import { StaleError } from '../types.js'
import type { HuoziCloudflareBindings } from './bindings.js'
import { blobKey } from './sha.js'
import {
  deserializeBatch,
  deserializeWrite,
} from './workspace-do.js'

function encodeBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

export class CloudflareStorage implements StorageBackend {
  constructor(private env: HuoziCloudflareBindings) {}

  private workspaceStub(workspaceId: string): DurableObjectStub {
    const id = this.env.WORKSPACE_DO.idFromName(workspaceId)
    return this.env.WORKSPACE_DO.get(id)
  }

  async readFile(
    workspaceId: string,
    path: string,
    _signal?: AbortSignal,
  ): Promise<FileRecord | null> {
    const row = await this.env.DB.prepare(
      `SELECT workspace_id, path, blob_sha, size, mtime, encoding, line_endings
       FROM files_current WHERE workspace_id = ? AND path = ?`,
    )
      .bind(workspaceId, path)
      .first<{
        workspace_id: string
        path: string
        blob_sha: string
        size: number
        mtime: number
        encoding: string | null
        line_endings: string | null
      }>()

    if (!row) return null

    const obj = await this.env.BLOBS.get(blobKey(row.blob_sha))
    if (!obj) {
      // D1 says the blob exists but R2 doesn't have it. Treat as not-found;
      // a reconciler would repair this, but for v1 we fail fast-softly.
      return null
    }
    const content = new Uint8Array(await obj.arrayBuffer())

    return {
      workspaceId: row.workspace_id,
      path: row.path,
      content,
      blob_sha: row.blob_sha,
      size: row.size,
      mtime: row.mtime,
      encoding:
        row.encoding === 'utf8' || row.encoding === 'utf16le'
          ? (row.encoding as 'utf8' | 'utf16le')
          : undefined,
      lineEndings:
        row.line_endings === 'LF' || row.line_endings === 'CRLF'
          ? (row.line_endings as 'LF' | 'CRLF')
          : undefined,
    }
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
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/write-file', {
      method: 'POST',
      body: JSON.stringify({
        method: 'write-file',
        workspaceId: args.workspaceId,
        path: args.path,
        contentBase64: encodeBase64(args.content),
        author: args.author,
        parent_sha: args.parent_sha,
        message: args.message,
      }),
      headers: { 'content-type': 'application/json' },
    })

    if (res.status === 409) {
      const body = (await res.json()) as {
        current_blob_sha: string | null
        expected_parent_sha: string | null
      }
      throw new StaleError({
        current_blob_sha: body.current_blob_sha,
        expected_parent_sha: body.expected_parent_sha,
      })
    }
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`workspace DO write-file failed: ${res.status} ${body}`)
    }
    return deserializeWrite(await res.json())
  }

  async writeBatch(args: BatchWriteArgs): Promise<BatchWriteResult> {
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/write-batch', {
      method: 'POST',
      body: JSON.stringify({
        method: 'write-batch',
        workspaceId: args.workspaceId,
        edits: args.edits.map((e) => ({
          path: e.path,
          contentBase64: encodeBase64(e.content),
          parent_sha: e.parent_sha,
          additions: e.additions,
          deletions: e.deletions,
        })),
        author: args.author,
        message: args.message,
        allOrNothing: args.allOrNothing,
      }),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`workspace DO write-batch failed: ${res.status}`)
    }
    return deserializeBatch(await res.json())
  }

  async listFiles(
    workspaceId: string,
    opts?: ListOptions,
    _signal?: AbortSignal,
  ): Promise<ListEntry[]> {
    const prefix = opts?.prefix ?? ''
    const limit = opts?.limit ?? 10000
    const q = prefix
      ? `SELECT path, blob_sha, size, mtime FROM files_current
         WHERE workspace_id = ? AND path LIKE ? || '%'
         ORDER BY path ASC LIMIT ?`
      : `SELECT path, blob_sha, size, mtime FROM files_current
         WHERE workspace_id = ?
         ORDER BY path ASC LIMIT ?`
    const stmt = prefix
      ? this.env.DB.prepare(q).bind(workspaceId, prefix, limit)
      : this.env.DB.prepare(q).bind(workspaceId, limit)
    const { results } = await stmt.all<{
      path: string
      blob_sha: string
      size: number
      mtime: number
    }>()
    return results.map((r) => ({
      path: r.path,
      blob_sha: r.blob_sha,
      size: r.size,
      mtime: r.mtime,
    }))
  }

  async listCommits(
    workspaceId: string,
    opts?: ListCommitsOptions,
    _signal?: AbortSignal,
  ): Promise<ListCommitsResult> {
    const limit = Math.min(opts?.limit ?? 20, 100)
    const beforeTs = opts?.before
      ? await this.commitTimestamp(workspaceId, opts.before)
      : null

    // When `file_path` is given, restrict to commits referenced in commit_paths.
    const rows = await this.selectCommits({
      workspaceId,
      filePath: opts?.file_path,
      beforeTs,
      limit: limit + 1,
    })

    // Rehydrate CommitRecord for each row. paths_json gives us the full path list.
    const commits: CommitRecord[] = rows.map((r) => ({
      commit_sha: r.commit_sha,
      parent_sha: r.parent_sha,
      workspaceId: r.workspace_id,
      author: { id: r.author_id, type: r.author_type as Author['type'] },
      timestamp: r.timestamp,
      message: r.message,
      paths: JSON.parse(r.paths_json) as CommitPathEntry[],
    }))

    const hasMore = commits.length > limit
    const page = hasMore ? commits.slice(0, limit) : commits
    const nextBefore = hasMore ? page[page.length - 1]?.commit_sha : undefined
    return {
      commits: page,
      has_more: hasMore,
      ...(nextBefore ? { next_before: nextBefore } : {}),
    }
  }

  async searchFts(
    workspaceId: string,
    literal: string,
    opts?: { limit?: number; prefix?: string },
    _signal?: AbortSignal,
  ): Promise<string[]> {
    if (literal.length < 3) return []
    const limit = opts?.limit ?? 500
    const prefix = opts?.prefix ?? ''

    // FTS5 trigram MATCH — wrap literal in double quotes so it's a phrase,
    // and double-escape any internal quotes.
    const safeLiteral = literal.replace(/"/g, '""')
    const matchExpr = `"${safeLiteral}"`

    const q = prefix
      ? `SELECT path FROM file_fts
         WHERE workspace_id = ? AND content MATCH ? AND path LIKE ? || '%'
         LIMIT ?`
      : `SELECT path FROM file_fts
         WHERE workspace_id = ? AND content MATCH ?
         LIMIT ?`
    const stmt = prefix
      ? this.env.DB.prepare(q).bind(workspaceId, matchExpr, prefix, limit)
      : this.env.DB.prepare(q).bind(workspaceId, matchExpr, limit)

    const { results } = await stmt.all<{ path: string }>()
    return results.map((r) => r.path)
  }

  private async commitTimestamp(
    workspaceId: string,
    commit_sha: string,
  ): Promise<number | null> {
    const row = await this.env.DB.prepare(
      'SELECT timestamp FROM commits WHERE workspace_id = ? AND commit_sha = ?',
    )
      .bind(workspaceId, commit_sha)
      .first<{ timestamp: number }>()
    return row?.timestamp ?? null
  }

  private async selectCommits(args: {
    workspaceId: string
    filePath?: string
    beforeTs: number | null
    limit: number
  }): Promise<
    Array<{
      commit_sha: string
      parent_sha: string | null
      workspace_id: string
      author_id: string
      author_type: string
      message: string
      timestamp: number
      paths_json: string
    }>
  > {
    // We always join through commit_paths when a filePath is given, to avoid
    // scanning paths_json JSON strings.
    const parts: string[] = [
      'SELECT c.commit_sha, c.parent_sha, c.workspace_id, c.author_id,',
      '       c.author_type, c.message, c.timestamp, c.paths_json',
      'FROM commits c',
    ]
    const binds: unknown[] = []

    if (args.filePath) {
      parts.push('JOIN commit_paths cp')
      parts.push('  ON cp.workspace_id = c.workspace_id')
      parts.push('  AND cp.commit_sha = c.commit_sha')
      parts.push('WHERE c.workspace_id = ? AND cp.path = ?')
      binds.push(args.workspaceId, args.filePath)
    } else {
      parts.push('WHERE c.workspace_id = ?')
      binds.push(args.workspaceId)
    }
    if (args.beforeTs !== null) {
      parts.push('AND c.timestamp < ?')
      binds.push(args.beforeTs)
    }
    parts.push('ORDER BY c.timestamp DESC, c.commit_sha DESC')
    parts.push('LIMIT ?')
    binds.push(args.limit)

    const stmt = this.env.DB.prepare(parts.join('\n'))
    const { results } = await stmt.bind(...binds).all<{
      commit_sha: string
      parent_sha: string | null
      workspace_id: string
      author_id: string
      author_type: string
      message: string
      timestamp: number
      paths_json: string
    }>()
    return results
  }

  // ── Delete / rename (thin DO proxies) ────────────────────────────────

  async deleteFile(args: {
    workspaceId: string
    path: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<DeleteResult> {
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/delete-file', {
      method: 'POST',
      body: JSON.stringify({
        method: 'delete-file',
        workspaceId: args.workspaceId,
        path: args.path,
        author: args.author,
        message: args.message,
      }),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`workspace DO delete-file failed: ${res.status}`)
    }
    return (await res.json()) as DeleteResult
  }

  async deletePrefix(args: {
    workspaceId: string
    prefix: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<DeletePrefixResult> {
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/delete-prefix', {
      method: 'POST',
      body: JSON.stringify({
        method: 'delete-prefix',
        workspaceId: args.workspaceId,
        prefix: args.prefix,
        author: args.author,
        message: args.message,
      }),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`workspace DO delete-prefix failed: ${res.status}`)
    }
    return (await res.json()) as DeletePrefixResult
  }

  async renamePath(args: {
    workspaceId: string
    from: string
    to: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<RenameResult> {
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/rename-path', {
      method: 'POST',
      body: JSON.stringify({
        method: 'rename-path',
        workspaceId: args.workspaceId,
        from: args.from,
        to: args.to,
        author: args.author,
        message: args.message,
      }),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`workspace DO rename-path failed: ${res.status}`)
    }
    return (await res.json()) as RenameResult
  }

  async renamePrefix(args: {
    workspaceId: string
    fromPrefix: string
    toPrefix: string
    author: Author
    message?: string
    signal?: AbortSignal
  }): Promise<RenamePrefixResult> {
    const stub = this.workspaceStub(args.workspaceId)
    const res = await stub.fetch('https://workspace/rename-prefix', {
      method: 'POST',
      body: JSON.stringify({
        method: 'rename-prefix',
        workspaceId: args.workspaceId,
        fromPrefix: args.fromPrefix,
        toPrefix: args.toPrefix,
        author: args.author,
        message: args.message,
      }),
      headers: { 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`workspace DO rename-prefix failed: ${res.status}`)
    }
    return (await res.json()) as RenamePrefixResult
  }
}
