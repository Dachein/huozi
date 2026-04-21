#!/usr/bin/env node
/**
 * stdio launcher for huozi-cloud's MCP server.
 *
 * Protocol: MCP stdio — the standard way Cursor / Claude Code / mcp-inspect
 * connect to a local MCP server. Configure your client to spawn:
 *
 *     node dist/mcp/stdio.js
 *
 * Env vars:
 *   HUOZI_WORKSPACE   workspace id           (default 'ws_default')
 *   HUOZI_PRINCIPAL   authenticated id       (default 'agent_local')
 *   HUOZI_PRINCIPAL_TYPE  'agent'|'user'|'system' (default 'agent')
 *   HUOZI_SCOPE       path prefix scope      (default null = full workspace)
 *   HUOZI_DEMO        '1' to seed demo files (default off)
 *
 * The in-memory storage is ephemeral — each launcher instance has its own
 * empty workspace unless seeded. Good for demos, not for real use.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { InMemoryStorage } from '../storage/memory.js'
import { seedDemoWorkspace } from './demo-seed.js'
import { createHuoziMcpServer } from './server.js'

async function main(): Promise<void> {
  const workspaceId = process.env['HUOZI_WORKSPACE'] ?? 'ws_default'
  const principalId = process.env['HUOZI_PRINCIPAL'] ?? 'agent_local'
  const principalTypeEnv = process.env['HUOZI_PRINCIPAL_TYPE'] ?? 'agent'
  const scopePath = process.env['HUOZI_SCOPE'] ?? null
  const demoMode = process.env['HUOZI_DEMO'] === '1'

  const principalType: 'user' | 'agent' | 'system' =
    principalTypeEnv === 'user'
      ? 'user'
      : principalTypeEnv === 'system'
        ? 'system'
        : 'agent'

  const storage = new InMemoryStorage()
  if (demoMode) {
    await seedDemoWorkspace(storage, workspaceId)
  }

  const server = createHuoziMcpServer({
    storage,
    principal: {
      workspaceId,
      principalId,
      principalType,
      scopePath,
    },
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Server now runs until transport closes. `server.connect` returns after
  // wiring — actual I/O happens in the background. Keep the process alive
  // by awaiting close-on-stdin-eof, which StdioServerTransport handles.
}

main().catch((err: unknown) => {
  // Errors go to stderr so they don't pollute the stdio JSON-RPC channel.
  console.error('[huozi-cloud/stdio] fatal:', err)
  process.exit(1)
})
