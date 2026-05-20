/**
 * Minimal MCP-over-HTTP client.
 *
 * huozi-cloud's `/mcp` endpoint speaks JSON-RPC 2.0 over POST with a
 * Bearer token. Rather than pulling in the full @modelcontextprotocol/sdk,
 * we hit it directly — we only need a handful of tools and the request
 * envelope is trivial.
 *
 * Tool results come back with both a `content` block (human-rendered text)
 * and `structuredContent` (the typed payload). We use `structuredContent`
 * exclusively.
 *
 * huozi_read is keyed by (workspaceId, principalId) server-side, so multiple
 * clients owned by the same user share the read-cache. The daemon therefore
 * keeps its own (path → {blob_sha, content}) cache and busts the server
 * cache with an explicit offset/limit on cold cache misses.
 */

import type { Config } from './config.js'
import { log } from './log.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcSuccess<T> {
  jsonrpc: '2.0'
  id: number
  result: T
}

interface JsonRpcError {
  jsonrpc: '2.0'
  id: number
  error: { code: number; message: string; data?: unknown }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

interface McpToolResult<S = unknown> {
  content: Array<{ type: 'text'; text: string } | { type: string; [k: string]: unknown }>
  structuredContent?: S
  isError?: boolean
}

type ReadOutput =
  | {
      type: 'text'
      file: {
        filePath: string
        content: string
        numLines: number
        startLine: number
        totalLines: number
        blob_sha: string
      }
    }
  | {
      type: 'file_unchanged'
      file: { filePath: string; blob_sha: string }
    }
  | {
      type: 'binary_ref'
      file: {
        filePath: string
        mimeType: string
        size: number
        sha: string
        url: string
        expiresAt: number
      }
    }

export interface FileContent {
  path: string
  content: string
  blob_sha: string
}

export class McpClient {
  private counter = 0
  private readCache = new Map<string, { blob_sha: string; content: string }>()

  constructor(private cfg: Pick<Config, 'cloudBaseUrl' | 'apiKey'>) {}

  private nextId(): number {
    this.counter += 1
    return this.counter
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method,
      params,
    }
    const res = await fetch(`${this.cfg.cloudBaseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(req),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`mcp http ${res.status}: ${text.slice(0, 200)}`)
    }
    const body = (await res.json()) as JsonRpcResponse<T>
    if ('error' in body) {
      throw new Error(`mcp error ${body.error.code}: ${body.error.message}`)
    }
    return body.result
  }

  private async callTool<S>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult<S>> {
    const result = await this.rpc<McpToolResult<S>>('tools/call', {
      name,
      arguments: args,
    })
    if (result.isError) {
      const text = (result.content[0] as { text?: string } | undefined)?.text ?? 'unknown'
      throw new Error(`tool ${name} failed: ${text}`)
    }
    return result
  }

  // ── Tool wrappers ────────────────────────────────────────────────

  async read(filePath: string): Promise<FileContent | null> {
    // Step 1: try a no-args (full) read first — that's what huozi_write needs
    // to see in readFileState.
    const first = await this.rawRead(filePath, false)
    if (first === null) return null
    if (first.kind === 'text') return first.value

    // file_unchanged. If we have client-side bytes for this blob_sha, use them
    // — readFileState is already in the "full read" shape from a prior call.
    const cached = this.readCache.get(filePath)
    if (cached && cached.blob_sha === first.blob_sha) {
      return { path: filePath, content: cached.content, blob_sha: cached.blob_sha }
    }

    // Cold cache (typical for a fresh daemon process). Two extra calls:
    //   bust  — partial read with a deliberately odd offset/limit to dodge
    //           the (path, offset, limit, blob_sha) server cache key.
    //   reset — no-args read again. Last entry was partial, so the server
    //           re-reads in full, restoring readFileState to the shape that
    //           huozi_write requires (offset === undefined, limit === undefined).
    log.debug('huozi_read cold cache, busting', { filePath })
    const bust = await this.rawRead(filePath, true)
    if (bust === null || bust.kind !== 'text') {
      throw new Error(`huozi_read: bust failed for ${filePath}`)
    }
    const reset = await this.rawRead(filePath, false)
    if (reset === null) {
      throw new Error(`huozi_read: reset returned null for ${filePath}`)
    }
    return bust.value
  }

  private async rawRead(
    filePath: string,
    partial: boolean,
  ): Promise<
    | { kind: 'text'; value: FileContent }
    | { kind: 'file_unchanged'; blob_sha: string }
    | null
  > {
    const args: Record<string, unknown> = { file_path: filePath }
    if (partial) {
      args.offset = 1
      args.limit = 991_337
    }

    let result: McpToolResult<ReadOutput>
    try {
      result = await this.callTool<ReadOutput>('huozi_read', args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('FILE_NOT_FOUND') || msg.includes('does not exist')) return null
      throw err
    }

    const data = result.structuredContent
    if (!data) throw new Error(`huozi_read: missing structuredContent`)

    if (data.type === 'text') {
      const raw = stripLineNumbers(data.file.content)
      const fc: FileContent = {
        path: data.file.filePath,
        content: raw,
        blob_sha: data.file.blob_sha,
      }
      this.readCache.set(filePath, { blob_sha: fc.blob_sha, content: fc.content })
      return { kind: 'text', value: fc }
    }
    if (data.type === 'file_unchanged') {
      return { kind: 'file_unchanged', blob_sha: data.file.blob_sha }
    }
    if (data.type === 'binary_ref') {
      throw new Error(`huozi_read: binary content not supported in daemon (path=${filePath})`)
    }
    throw new Error(`huozi_read: unknown type ${(data as { type: string }).type}`)
  }

  // ── helpers ──────────────────────────────────────────────────────

  /**
   * Append one or more JSONL lines to a file. Reads current bytes, appends,
   * writes back with parent_blob_sha for staleness detection; retries on
   * conflict. Creates the file with an optional `seedLines` (e.g. the
   * canonical schema event) if it doesn't exist yet.
   */
  async appendJsonl(
    filePath: string,
    newLines: string[],
    opts: { seedLinesIfMissing?: string[]; maxRetries?: number } = {},
  ): Promise<void> {
    const maxRetries = opts.maxRetries ?? 4
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existing = await this.read(filePath)
      let nextContent: string
      let parent_sha: string | null
      if (existing) {
        const tail = existing.content.endsWith('\n') ? '' : '\n'
        nextContent = existing.content + tail + newLines.join('\n') + '\n'
        parent_sha = existing.blob_sha
      } else {
        const seed = opts.seedLinesIfMissing ?? []
        nextContent = [...seed, ...newLines].join('\n') + '\n'
        parent_sha = null
      }
      try {
        const result = await this.callTool<{ blob_sha?: string }>('huozi_write', {
          file_path: filePath,
          content: nextContent,
          parent_blob_sha: parent_sha,
        })
        // Refresh the read cache so the next read short-circuits cleanly
        // instead of going back to the server (which will say file_unchanged
        // against the stale blob_sha until we issue another read).
        const newSha = result.structuredContent?.blob_sha
        if (newSha) {
          this.readCache.set(filePath, { blob_sha: newSha, content: nextContent })
        } else {
          this.readCache.delete(filePath)
        }
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('MODIFIED_SINCE') || msg.includes('stale')) {
          log.debug('appendJsonl stale, retrying', { filePath, attempt })
          this.readCache.delete(filePath)
          continue
        }
        throw err
      }
    }
    throw new Error(`appendJsonl failed after ${maxRetries} attempts: ${filePath}`)
  }
}

// cat -n prefix: `      <num>\t` — up to 6 chars of leading spaces + digits + tab.
const LINE_NUMBER_PREFIX = /^ *\d+\t/gm

function stripLineNumbers(content: string): string {
  return content.replace(LINE_NUMBER_PREFIX, '')
}
