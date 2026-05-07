/**
 * Server-side MCP client for talking to cloud.huozi.app/mcp.
 *
 * Used by huozi.app's Next.js server to render "cloud workspace" pages.
 * Users' API keys live in a server-only cookie; this module reads that cookie
 * out-of-band (callers pass it in explicitly).
 *
 * Never import this module from a client component — it relies on Node's
 * fetch + secrets being in the server environment.
 */

import { cloudFetch } from '@/lib/cloud-fetch'

export interface McpCallResult<T = unknown> {
  ok: true
  data: T
  rendered: string
}
export interface McpCallFailure {
  ok: false
  isError: true
  errorCode: number
  message: string
}
export type McpResult<T = unknown> = McpCallResult<T> | McpCallFailure

interface RpcEnvelope {
  jsonrpc: '2.0'
  id: number
  result?: {
    isError?: boolean
    content?: Array<{ type: string; text?: string }>
    structuredContent?: Record<string, unknown>
  }
  error?: { code: number; message: string }
}

let nextId = 1
async function rpc(
  key: string,
  method: string,
  params?: Record<string, unknown>,
  opts?: { useSession?: boolean },
): Promise<RpcEnvelope> {
  const id = nextId++
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  }
  if (!opts?.useSession) {
    // The Agent-side ReadFileState cache is meant for Claude Code's
    // Read→Edit loop (skip re-sending bytes the caller already has). For
    // SSR Web UI renders that's a footgun — we want every page load to see
    // the current bytes. This header tells the Worker to use an empty,
    // non-persistent state for this request.
    //
    // Inline-edit (`/api/app/drive/edit`) flips this OFF so the read
    // populates the user's session DO, letting the immediately-following
    // huozi_edit pass its Read-first invariant in the same DO.
    headers['X-Huozi-No-Session'] = '1'
  }
  const res = await cloudFetch(`/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    // Explicitly opt out of Next.js caching for dynamic data.
    cache: 'no-store',
  })
  if (!res.ok) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: res.status, message: `HTTP ${res.status}` },
    }
  }
  return (await res.json()) as RpcEnvelope
}

async function callTool<T>(
  key: string,
  name: string,
  args: Record<string, unknown>,
  opts?: { useSession?: boolean },
): Promise<McpResult<T>> {
  const env = await rpc(key, 'tools/call', { name, arguments: args }, opts)
  if (env.error) {
    return {
      ok: false,
      isError: true,
      errorCode: env.error.code,
      message: env.error.message,
    }
  }
  const result = env.result
  if (!result) {
    return { ok: false, isError: true, errorCode: 0, message: 'empty result' }
  }
  if (result.isError) {
    const sc = result.structuredContent as
      | { errorCode?: number; message?: string }
      | undefined
    return {
      ok: false,
      isError: true,
      errorCode: sc?.errorCode ?? 0,
      message: sc?.message ?? result.content?.[0]?.text ?? 'error',
    }
  }
  return {
    ok: true,
    data: (result.structuredContent ?? {}) as T,
    rendered: result.content?.[0]?.text ?? '',
  }
}

// ── Typed tool wrappers used by the UI ─────────────────────────────────

export interface GlobData {
  durationMs: number
  numFiles: number
  filenames: string[]
  truncated: boolean
}

export interface ReadTextData {
  type: 'text' | 'file_unchanged' | 'binary_ref' | 'image' | 'pdf' | 'parts' | 'notebook'
  file: {
    filePath: string
    content?: string
    numLines?: number
    startLine?: number
    totalLines?: number
    blob_sha?: string
    size?: number
    mimeType?: string
    url?: string
  }
}

export interface HistoryEntry {
  commit_sha: string
  parent_sha: string | null
  author: { id: string; type: 'agent' | 'user' | 'system' }
  timestamp: number
  message: string
  operation: 'create' | 'edit' | 'write' | 'delete' | 'batch' | 'revert'
  additions: number
  deletions: number
}
export interface HistoryData {
  history: HistoryEntry[]
  has_more: boolean
  next_before?: string
}

export interface ListToolsData {
  tools: Array<{ name: string; description?: string }>
}

export async function listTools(key: string): Promise<McpResult<ListToolsData>> {
  const env = await rpc(key, 'tools/list')
  if (env.error) {
    return {
      ok: false,
      isError: true,
      errorCode: env.error.code,
      message: env.error.message,
    }
  }
  return {
    ok: true,
    data: (env.result as unknown as ListToolsData) ?? { tools: [] },
    rendered: '',
  }
}

export function cloudGlob(
  key: string,
  pattern: string,
  path?: string,
): Promise<McpResult<GlobData>> {
  return callTool<GlobData>(key, 'huozi_glob', {
    pattern,
    ...(path ? { path } : {}),
  })
}

export interface GrepData {
  mode?: 'content' | 'files_with_matches' | 'count'
  numFiles: number
  filenames: string[]
  content?: string
  numLines?: number
  numMatches?: number
  appliedLimit?: number
  appliedOffset?: number
}

export interface GrepOpts {
  path?: string
  glob?: string
  type?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  '-i'?: boolean
  '-n'?: boolean
  '-A'?: number
  '-B'?: number
  '-C'?: number
  context?: number
  multiline?: boolean
  head_limit?: number
  offset?: number
}

export function cloudGrep(
  key: string,
  pattern: string,
  opts?: GrepOpts,
): Promise<McpResult<GrepData>> {
  const args: Record<string, unknown> = { pattern }
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined) args[k] = v
    }
  }
  return callTool<GrepData>(key, 'huozi_grep', args)
}

export function cloudRead(
  key: string,
  file_path: string,
  opts?: { offset?: number; limit?: number },
): Promise<McpResult<ReadTextData>> {
  return callTool<ReadTextData>(key, 'huozi_read', {
    file_path,
    ...(opts?.offset ? { offset: opts.offset } : {}),
    ...(opts?.limit ? { limit: opts.limit } : {}),
  })
}

export interface RecentEntry {
  path: string
  operation: string
  commit_sha: string
  timestamp: number
  author: { id: string; type: 'user' | 'agent' | 'system' }
  message: string
  in_batch: number
}

export async function cloudRecent(
  key: string,
  limit = 20,
): Promise<{ ok: true; entries: RecentEntry[] } | { ok: false; message: string }> {
  try {
    const res = await cloudFetch(
      `/events/recent?limit=${encodeURIComponent(String(limit))}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as {
      ok?: boolean
      entries?: RecentEntry[]
    }
    if (!body.ok || !Array.isArray(body.entries)) {
      return { ok: false, message: 'bad_response' }
    }
    return { ok: true, entries: body.entries }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function cloudHistory(
  key: string,
  file_path: string,
  opts?: { limit?: number; before?: string },
): Promise<McpResult<HistoryData>> {
  return callTool<HistoryData>(key, 'huozi_history', {
    file_path,
    ...(opts?.limit ? { limit: opts.limit } : {}),
    ...(opts?.before ? { before: opts.before } : {}),
  })
}

/**
 * Reserve an empty folder by writing a `.huozi-keep` placeholder under it.
 * Mirrors `huozi_mkdir` semantics from the MCP tool. Used by the folder ACL
 * UI so a freshly-locked folder shows up in the file tree even if no real
 * files have been written into it yet.
 */
export function cloudMkdir(
  key: string,
  path: string,
): Promise<McpResult<{ created: boolean }>> {
  return callTool<{ created: boolean }>(key, 'huozi_mkdir', { path })
}

export interface RmData {
  path: string
  mode: 'file' | 'prefix'
  dry_run: boolean
  deleted_paths: string[]
  commit_sha: string | null
}

/**
 * Delete a single file via the audited MCP path. Used by the Web UI's
 * `/workspace/assets` lightbox (deliberate exception to "Web is read-only" —
 * see /api/app/assets/delete/route.ts for scope rationale).
 */
export function cloudRm(
  key: string,
  path: string,
): Promise<McpResult<RmData>> {
  return callTool<RmData>(key, 'huozi_rm', { path })
}

// ── Inline-edit pair (Web UI carve-out) ─────────────────────────────────
//
// huozi_edit requires the caller to have read the file in the same Worker
// session DO (so blob_sha can be staleness-checked). For SSR-rendered pages
// every fetch sets X-Huozi-No-Session: 1, which is exactly the wrong default
// for an interactive read→edit pair. The two helpers below opt INTO the
// session DO so the read populates state for the immediately-following edit.
//
// Both helpers are server-only and assume the same `key` (and therefore the
// same principalId → same session DO) is used for both calls.

/**
 * Read a file with session DO state populated. Pair with `cloudEdit` for
 * inline-edit flows. Do NOT use for SSR page rendering — that's what
 * `cloudRead` is for.
 */
export function cloudReadForEdit(
  key: string,
  file_path: string,
): Promise<McpResult<ReadTextData>> {
  return callTool<ReadTextData>(
    key,
    'huozi_read',
    { file_path },
    { useSession: true },
  )
}

export interface EditData {
  filePath: string
  oldString: string
  newString: string
  commit_sha: string
  new_blob_sha: string
}

/**
 * Apply a single old_string→new_string edit to a workspace file. Must be
 * preceded by a `cloudReadForEdit` for the same path in the same session.
 */
export function cloudEdit(
  key: string,
  args: {
    file_path: string
    old_string: string
    new_string: string
    replace_all?: boolean
  },
): Promise<McpResult<EditData>> {
  return callTool<EditData>(key, 'huozi_edit', args, { useSession: true })
}

// ── Helpers for the UI ─────────────────────────────────────────────────

/**
 * Cat -n formatted content (from Read) → plain content, stripping the line
 * number prefix so the UI can render on its own.
 */
export function stripCatN(content: string): string {
  return content
    .split('\n')
    .map((ln) => {
      const m = ln.match(/^\s*\d+\t(.*)$/)
      return m ? (m[1] ?? '') : ln
    })
    .join('\n')
}

export const HUOZI_CLOUD_KEY_COOKIE = 'huozi-cloud-key'
