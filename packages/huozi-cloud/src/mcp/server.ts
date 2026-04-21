/**
 * MCP server factory.
 *
 * Exposes the 7 huozi_* tools via MCP's ListTools / CallTool request handlers.
 * Per-session `ReadFileState` lives inside a single server instance — which
 * is one MCP client connection. Spawning a second client gets its own state,
 * matching CC's per-session readFileState semantics (SPEC §5.1).
 *
 * Transport-agnostic: callers pass any `Transport` (stdio / SSE / streamable-http).
 * Bearer-token-based principal extraction happens at the *transport* layer in
 * production; here we accept a pre-resolved principal and scope.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { InMemoryReadFileState } from '../state/ReadFileState.js'
import type { StorageBackend } from '../storage/types.js'
import type { ToolUseContext } from '../types.js'
import { createHuoziToolRegistry, type HuoziToolRegistry } from './tools.js'

export interface McpPrincipal {
  workspaceId: string
  principalId: string
  principalType: 'user' | 'agent' | 'system'
  /** Null = full workspace access. Non-null = limited to this path prefix. */
  scopePath: string | null
}

export interface HuoziMcpServerDeps {
  storage: StorageBackend
  principal: McpPrincipal
  /**
   * Optional — lets the production (DO-backed) session factory plug in.
   * Default: fresh in-memory state per server instance.
   */
  sessionFactory?: (principal: McpPrincipal) => {
    readFileState: ToolUseContext['readFileState']
  }
}

export interface HuoziMcpServerHandle {
  connect(transport: Transport): Promise<void>
  close(): Promise<void>
  registry: HuoziToolRegistry
}

/**
 * Build and wire the MCP server. Does NOT bind a transport — caller decides
 * (stdio, SSE, streamable-http, etc.) and calls `handle.connect(transport)`.
 */
export function createHuoziMcpServer(
  deps: HuoziMcpServerDeps,
): HuoziMcpServerHandle {
  const registry = createHuoziToolRegistry({ storage: deps.storage })
  const { readFileState } =
    deps.sessionFactory?.(deps.principal) ??
    { readFileState: new InMemoryReadFileState() }

  const server = new Server(
    {
      name: 'huozi-cloud',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
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
    return { tools }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = registry.get(req.params.name)
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${req.params.name}`,
          },
        ],
      }
    }

    const ctx: ToolUseContext = {
      workspaceId: deps.principal.workspaceId,
      principalId: deps.principal.principalId,
      principalType: deps.principal.principalType,
      scopePath: deps.principal.scopePath,
      readFileState,
    }

    const result = await tool.run(req.params.arguments ?? {}, ctx)

    if (result.kind === 'error') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error ${result.errorCode}: ${result.message}`,
          },
        ],
        // Structured payload too — MCP clients that know about it can use it.
        structuredContent: {
          errorCode: result.errorCode,
          message: result.message,
          ...(result.meta ? { meta: result.meta } : {}),
        },
      }
    }

    const renderedText = tool.renderResult(result.data)
    return {
      content: [{ type: 'text', text: renderedText }],
      structuredContent: result.data as Record<string, unknown>,
    }
  })

  return {
    registry,
    async connect(transport) {
      await server.connect(transport)
    },
    async close() {
      await server.close()
    },
  }
}
