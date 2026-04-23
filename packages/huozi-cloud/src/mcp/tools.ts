/**
 * Bundled tool registry — the huozi_* tools configured with a shared
 * StorageBackend, ready to hand to an MCP Server.
 *
 * Kept deliberately thin so both the stdio launcher and any future Worker
 * entry point construct the same set of tools the same way.
 *
 * Share-related tools require extra wiring beyond `storage` (they talk
 * to D1 directly via a `createShare` function passed in by the Worker).
 * That wiring is `shareDeps`, optional — callers without share support
 * (e.g. the InMemoryStorage bench) simply omit it and the tool is not
 * registered.
 */

import {
  createBatchEditTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createHistoryTool,
  createReadTool,
  createWriteTool,
} from '../index.js'
import { createListTreeTool } from '../tools/ListTreeTool.js'
import { createMkdirTool } from '../tools/MkdirTool.js'
import { createMvTool } from '../tools/MvTool.js'
import { createRmTool } from '../tools/RmTool.js'
import { createShareTool, type ShareToolDeps } from '../tools/ShareTool.js'
import type { StorageBackend } from '../storage/types.js'
import type { Tool } from '../types.js'

export interface HuoziToolRegistry {
  readonly tools: readonly Tool<any, any>[]
  get(name: string): Tool<any, any> | undefined
}

export interface HuoziToolRegistryDeps {
  storage: StorageBackend
  /**
   * Enables the `huozi_share` tool. Only Cloud / Edge worker deployments
   * have the D1 bindings required; tests / in-memory runs leave this off.
   */
  shareDeps?: ShareToolDeps
}

export function createHuoziToolRegistry(
  deps: HuoziToolRegistryDeps,
): HuoziToolRegistry {
  const { storage, shareDeps } = deps
  const tools: Tool<any, any>[] = [
    createReadTool({ storage }),
    createEditTool({ storage }),
    createWriteTool({ storage }),
    createGlobTool({ storage }),
    createGrepTool({ storage }),
    createListTreeTool({ storage }),
    createBatchEditTool({ storage }),
    createHistoryTool({ storage }),
    createMkdirTool({ storage }),
    createRmTool({ storage }),
    createMvTool({ storage }),
  ]
  if (shareDeps) {
    tools.push(createShareTool(shareDeps))
  }

  const byName = new Map<string, Tool<any, any>>()
  for (const t of tools) byName.set(t.name, t)

  return {
    tools,
    get(name) {
      return byName.get(name)
    },
  }
}
