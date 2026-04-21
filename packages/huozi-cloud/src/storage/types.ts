/**
 * Storage backend interface.
 *
 * Tools never touch R2/D1/DO directly — they go through this abstraction.
 * v1 implementations:
 *   - InMemoryStorage      (tests + PoC)
 *   - CloudflareStorage    (R2 + D1 + WorkspaceDO, coming later)
 *
 * Surface is intentionally narrow for v1 — grows as we add Edit/Write/Glob/Grep.
 */

import type { DetectedEncoding, LineEndingType } from '../cc-compat/index.js'

/**
 * What a storage backend returns from a read.
 * Shape loosely mirrors a Git blob + D1 `files_current` row.
 */
export interface FileRecord {
  workspaceId: string
  /** Path relative to workspace root. Never contains `..` after canonicalization. */
  path: string
  /** Raw bytes. Decoded downstream via cc-compat/readBytesWithMetadata. */
  content: Uint8Array
  /** Git blob SHA — the single source of truth for staleness comparison. */
  blob_sha: string
  size: number
  /** Unix ms — last commit-time for this file. */
  mtime: number
  /** Optional metadata the backend may cache to skip redetection. */
  encoding?: DetectedEncoding
  lineEndings?: LineEndingType
}

/**
 * Who/what authored a change. Flows into commit metadata and
 * `userModified` semantics on FileEditOutput (SPEC §4.2).
 */
export interface Author {
  id: string
  type: 'agent' | 'user' | 'system'
  /** True iff the write went through a human-confirmation flow (REST adapter). */
  confirmed?: boolean
}

/** What we get back after a successful write. */
export interface WriteResult {
  record: FileRecord
  operation: 'create' | 'update'
  /** Monotonic commit id; in-memory uses a counter, Git backend uses real SHA. */
  commit_sha: string
}

export interface ListOptions {
  /** Optional prefix filter (e.g. "funds/fund-A/"). */
  prefix?: string
  /** Hard cap on returned rows. Backend may return fewer. */
  limit?: number
}

export interface ListEntry {
  path: string
  blob_sha: string
  size: number
  /** Last-commit time, used by Glob's mtime-desc ordering. */
  mtime: number
}

/**
 * Minimal v1 storage surface. Tools never touch R2/D1/DO directly — they
 * go through this. Future additions (signed URL for binary_ref, batch writes,
 * history queries) extend this interface without breaking existing tools.
 */
export interface StorageBackend {
  /**
   * Fetch a file's current version. Returns null if path doesn't exist in
   * workspace.
   */
  readFile(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<FileRecord | null>

  /**
   * Write (create or update) a file.
   *
   * If `parent_sha` is given:
   *   - must match the current blob_sha of the file at `path`, OR
   *   - must be `null` iff the file currently doesn't exist.
   *   - staleness failure throws `StaleError`.
   * If `parent_sha` is undefined, callers are opting out of staleness — used
   * by trusted paths only.
   */
  writeFile(args: {
    workspaceId: string
    path: string
    content: Uint8Array
    author: Author
    parent_sha?: string | null
    message?: string
    signal?: AbortSignal
  }): Promise<WriteResult>

  /**
   * List files under the workspace (optionally prefix-filtered).
   * Backends should return stable ordering by path for determinism.
   */
  listFiles(
    workspaceId: string,
    opts?: ListOptions,
    signal?: AbortSignal,
  ): Promise<ListEntry[]>

  /**
   * Atomic multi-file write. All edits get a single `commit_sha`.
   *
   * Behavior when `allOrNothing: true` (default):
   *   - Validate every edit's `parent_sha` BEFORE any write.
   *   - If any mismatch → no writes, `aborted: true`, per-file errors reported.
   *   - If all match → write all, emit one `CommitRecord`, return `commit_sha`.
   *
   * Behavior when `allOrNothing: false`:
   *   - Still ONE commit. Failing edits are reported but the commit contains
   *     the successful subset. (CC doesn't do this; we add it for Agent
   *     resilience.)
   */
  writeBatch(args: BatchWriteArgs): Promise<BatchWriteResult>

  /**
   * Paginated commit history. Used by `huozi_history` and audit views.
   *
   * Filtering semantics:
   *   - No `file_path` → all commits in the workspace
   *   - `file_path` set → only commits whose `paths[]` includes that path
   *
   * Pagination: returned commits are sorted by timestamp desc; pass the
   * oldest `commit_sha` you received as `before` to fetch the next page.
   */
  listCommits(
    workspaceId: string,
    opts?: ListCommitsOptions,
    signal?: AbortSignal,
  ): Promise<ListCommitsResult>

  /**
   * Pre-filter candidate paths that *might* contain the given literal
   * substring.
   *
   * Contract: every path whose current content actually contains `literal`
   * MUST appear in the result. Extra paths (false positives) are allowed but
   * should be minimized for performance.
   *
   * Used by Grep to avoid linear-scanning every file in the workspace.
   * Implementations:
   *   - InMemoryStorage: full linear scan, returns the exact set.
   *   - CloudflareStorage: FTS5 trigram `MATCH '"literal"'`, sub-100ms.
   *
   * `literal` is the longest alphanumeric run extracted from the user's
   * regex pattern — callers are expected to feed only literals ≥ 3 chars.
   */
  searchFts(
    workspaceId: string,
    literal: string,
    opts?: { limit?: number; prefix?: string },
    signal?: AbortSignal,
  ): Promise<string[]>
}

/** Thrown by writeFile when `parent_sha` mismatches the current state. */
export class StaleError extends Error {
  readonly current_blob_sha: string | null
  readonly expected_parent_sha: string | null
  constructor(args: {
    current_blob_sha: string | null
    expected_parent_sha: string | null
  }) {
    super(
      `File has been modified since read. expected parent=${args.expected_parent_sha ?? 'null'}, current=${args.current_blob_sha ?? 'null'}`,
    )
    this.name = 'StaleError'
    this.current_blob_sha = args.current_blob_sha
    this.expected_parent_sha = args.expected_parent_sha
  }
}

// ───── Batch + history ───────────────────────────────────────────────────

/** What an individual file looks like inside a batch write or a commit. */
export interface CommitPathEntry {
  path: string
  operation: 'create' | 'update' | 'delete'
  before_blob_sha: string | null
  after_blob_sha: string | null
  additions: number
  deletions: number
}

/** One commit's full record — written by writeFile, writeBatch, etc. */
export interface CommitRecord {
  commit_sha: string
  parent_sha: string | null
  workspaceId: string
  author: Author
  timestamp: number
  message: string
  paths: CommitPathEntry[]
}

/** Per-path result inside a batch write. */
export interface BatchWriteItemResult {
  path: string
  success: boolean
  error?: { code: string; message: string }
  record?: FileRecord
  entry?: CommitPathEntry
}

export interface BatchWriteArgs {
  workspaceId: string
  edits: Array<{
    path: string
    content: Uint8Array
    /**
     * Expected current blob_sha. `null` = expect file does not yet exist.
     * `undefined` = opt out of staleness (seeding / migrations only).
     */
    parent_sha?: string | null
    /**
     * For richer per-path commit entries. Defaults: additions=0, deletions=0.
     * Callers already computing diffs can pass real numbers; otherwise the
     * backend fills zeros.
     */
    additions?: number
    deletions?: number
  }>
  author: Author
  message?: string
  /** Default true. False = partial success allowed (still one commit though). */
  allOrNothing?: boolean
  signal?: AbortSignal
}

export interface BatchWriteResult {
  aborted: boolean
  commit_sha: string | null
  results: BatchWriteItemResult[]
}

export interface ListCommitsOptions {
  /** Filter commits that touched this exact path. */
  file_path?: string
  /** Default 20, clamped to 100. */
  limit?: number
  /** Pagination cursor — return commits strictly older than this commit_sha. */
  before?: string
}

export interface ListCommitsResult {
  commits: CommitRecord[]
  has_more: boolean
  next_before?: string
}
