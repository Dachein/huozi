/**
 * Cloudflare Worker entry point.
 *
 * Exposes MCP-over-HTTP (JSON-RPC 2.0 over POST) at `/mcp`. This is a
 * lighter alternative to StreamableHTTPServerTransport — we handle the
 * `tools/list` and `tools/call` methods directly against our tool registry.
 *
 * Flow for each request to `/mcp`:
 *   1. Authenticate Bearer token via D1 → {workspaceId, principal, scopePath}
 *   2. Load ReadFileState snapshot from HuoziSessionDO
 *   3. Dispatch JSON-RPC method against our registry
 *   4. Persist (updated) ReadFileState snapshot back to DO
 *   5. Return JSON-RPC response
 *
 * Re-exports the DO classes so wrangler can bind them.
 */

import { createHuoziToolRegistry } from '../mcp/tools.js'
import { CloudflareStorage } from '../storage/cloudflare/storage.js'
import { resolveBearer } from '../storage/cloudflare/auth.js'
import {
  handleListKeys,
  handleMintKey,
  handleRevokeKey,
  type AdminEnv,
} from '../storage/cloudflare/admin.js'
import {
  handleMintTicket,
  handleWsUpgrade,
  sweepExpiredTickets,
} from '../storage/cloudflare/events.js'
import { handleRecent } from '../storage/cloudflare/recent.js'
import {
  createShareRow,
  handleCreateShare,
  handleGetShare,
  handleListShares,
  handleRevokeShare,
  handleUnlockShare,
} from '../storage/cloudflare/shares.js'
import {
  handleDeviceAuthorize,
  handleDeviceCode,
  handleDeviceDeny,
  handleDeviceInspect,
  handleDeviceToken,
} from '../storage/cloudflare/device-auth.js'
import {
  applyScopeToArgs,
  unscopeResult,
} from '../storage/cloudflare/scope.js'
import {
  loadSessionState,
  persistSessionState,
} from '../storage/cloudflare/session-state.js'
import { InMemoryReadFileState } from '../state/ReadFileState.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { HuoziCloudflareBindings } from '../storage/cloudflare/bindings.js'
import type { ToolUseContext } from '../types.js'

// Re-export for wrangler DO binding.
export { HuoziWorkspaceDO } from '../storage/cloudflare/workspace-do.js'
export { HuoziSessionDO } from '../storage/cloudflare/session-do.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): Response {
  const body: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  }
  return Response.json(body)
}

function rpcOk(id: string | number | null, result: unknown): Response {
  const body: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    result,
  }
  return Response.json(body)
}

const handler: ExportedHandler<HuoziCloudflareBindings> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'huozi-cloud' })
    }

    if (url.pathname === '/mcp') {
      return handleMcp(request, env)
    }

    // Real-time events — browsers open a WS here after fetching a ticket.
    if (url.pathname === '/events/mint-ticket') {
      // Opportunistic cleanup — cheap, bounded, swallows errors.
      ctx.waitUntil(sweepExpiredTickets(env))
      return handleMintTicket(request, env)
    }
    if (url.pathname === '/events/ws') {
      return handleWsUpgrade(request, env)
    }
    if (url.pathname === '/events/recent') {
      return handleRecent(request, env)
    }

    // Public shares — `huozi.app/p/<slug>` backing endpoints.
    if (url.pathname === '/shares') {
      return request.method === 'GET'
        ? handleListShares(request, env)
        : handleCreateShare(request, env)
    }
    {
      const m = url.pathname.match(/^\/shares\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?:\/(unlock|revoke))?$/)
      if (m) {
        const slug = m[1]!
        const action = m[2]
        if (action === 'unlock') return handleUnlockShare(request, env, slug)
        if (action === 'revoke') return handleRevokeShare(request, env, slug)
        return handleGetShare(request, env, slug)
      }
    }

    // Admin endpoints — server-to-server via HUOZI_ADMIN_SECRET.
    if (url.pathname === '/admin/mint-key') {
      try {
        return await handleMintKey(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/revoke-key') {
      try {
        return await handleRevokeKey(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/list-keys') {
      try {
        return await handleListKeys(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-authorize') {
      try {
        return await handleDeviceAuthorize(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-deny') {
      try {
        return await handleDeviceDeny(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-inspect') {
      try {
        return await handleDeviceInspect(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Device-flow public endpoints (no auth; Agents hit these).
    if (url.pathname === '/auth/device-code') {
      return handleDeviceCode(request, env)
    }
    if (url.pathname === '/auth/token') {
      return handleDeviceToken(request, env)
    }

    // TEMPORARY DEBUG: clear session state for the token's principal.
    if (url.pathname === '/debug/clear-session' && request.method === 'POST') {
      const authRes = await resolveBearer(
        request.headers.get('authorization'),
        env,
      )
      if (!authRes.ok) {
        return Response.json({ error: authRes.failure.message }, { status: 401 })
      }
      const key = `${authRes.principal.workspaceId}:${authRes.principal.principalId}`
      const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(key))
      const res = await stub.fetch('https://session/snapshot', { method: 'DELETE' })
      return Response.json({ ok: res.ok, sessionKey: key })
    }

    return new Response('not found', { status: 404 })
  },
}

async function handleMcp(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // Parse JSON-RPC envelope first so we can echo the id even on auth failure.
  let rpc: JsonRpcRequest
  try {
    rpc = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, 'parse error')
  }
  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(rpc.id ?? null, -32600, 'invalid request')
  }
  const reqId = rpc.id ?? null

  // Auth.
  const authRes = await resolveBearer(
    request.headers.get('authorization'),
    env,
  )
  if (!authRes.ok) {
    return rpcError(reqId, -32001, authRes.failure.message)
  }
  const principal = authRes.principal

  // Registry + storage.
  const storage = new CloudflareStorage(env)
  const registry = createHuoziToolRegistry({
    storage,
    shareDeps: {
      // Bind the D1-backed createShareRow to an arrow that matches the
      // Tool's expected signature (no env leaked into ShareTool itself).
      createShare: (principal, input) => createShareRow(env, principal, input),
      publicBase: 'https://huozi.app',
    },
  })

  if (rpc.method === 'initialize') {
    // Minimal initialize response so MCP clients are satisfied.
    return rpcOk(reqId, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'huozi-cloud', version: '0.1.0' },
    })
  }

  if (rpc.method === 'tools/list') {
    const tools = await Promise.all(
      registry.tools.map(async (t) => ({
        name: t.name,
        description: await t.prompt(),
        inputSchema: zodToJsonSchema(t.inputSchema, {
          target: 'openApi3',
          $refStrategy: 'none',
        }) as Record<string, unknown>,
      })),
    )
    return rpcOk(reqId, { tools })
  }

  if (rpc.method === 'tools/call') {
    const params = (rpc.params ?? {}) as {
      name?: string
      arguments?: Record<string, unknown>
    }
    if (!params.name) {
      return rpcError(reqId, -32602, 'missing params.name')
    }
    const tool = registry.get(params.name)
    if (!tool) {
      return rpcError(reqId, -32601, `unknown tool: ${params.name}`)
    }

    // Scope enforcement (SPEC §7.4). Applied BEFORE the tool sees the args,
    // so every path the tool operates on is already absolute within the
    // workspace. scope=null keys pass through untouched.
    const scoped = applyScopeToArgs(
      params.name,
      params.arguments ?? {},
      principal.scopePath,
    )
    if (!scoped.ok) {
      return rpcOk(reqId, {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error 101: ${scoped.message}`,
          },
        ],
        structuredContent: {
          errorCode: 101, // ERR.SCOPE_VIOLATION
          message: scoped.message,
        },
      })
    }

    // Stateless-read opt-out. Web UI renders on huozi.app set this header so
    // SSR page loads always see fresh content (the Agent-side session cache is
    // meant for Claude Code's `Read → Edit` loop, not for humans reloading a
    // page who want to see the current bytes every time).
    const noSession = request.headers.get('X-Huozi-No-Session') === '1'

    // Per-session DO for ReadFileState.
    const sessionKey = `${principal.workspaceId}:${principal.principalId}`
    const sessionStub = noSession
      ? null
      : env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionKey))

    const { state: readFileState } = sessionStub
      ? await loadSessionState(sessionStub)
      : { state: new InMemoryReadFileState() }

    const ctx: ToolUseContext = {
      workspaceId: principal.workspaceId,
      principalId: principal.principalId,
      principalType: principal.principalType,
      scopePath: principal.scopePath,
      readFileState,
    }

    let result
    try {
      result = await tool.run(scoped.args, ctx)
    } finally {
      if (sessionStub) {
        try {
          await persistSessionState(sessionStub, readFileState)
        } catch (err) {
          // Log but don't fail the request. The in-memory state was used
          // for this request; persist failures mean subsequent requests lose
          // that state, but they can rebuild it by re-reading.
          console.error('[persistSessionState] failed:', err)
        }
      }
    }

    if (result.kind === 'error') {
      return rpcOk(reqId, {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error ${result.errorCode}: ${result.message}`,
          },
        ],
        structuredContent: {
          errorCode: result.errorCode,
          message: result.message,
          ...(result.meta ? { meta: result.meta } : {}),
        },
      })
    }

    // Strip the scope prefix from any path-bearing field in the response so
    // the Agent never sees prefixes it couldn't have written.
    const unscoped = unscopeResult(
      params.name,
      result.data,
      principal.scopePath,
    ) as Record<string, unknown>

    return rpcOk(reqId, {
      content: [{ type: 'text', text: tool.renderResult(result.data) }],
      structuredContent: unscoped,
    })
  }

  return rpcError(reqId, -32601, `method not found: ${rpc.method}`)
}

export default handler
