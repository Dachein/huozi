/**
 * Bundled tool registry — the 7 huozi_* tools configured with a shared
 * StorageBackend, ready to hand to an MCP Server.
 *
 * Kept deliberately thin so both the stdio launcher and any future Worker
 * entry point construct the same set of tools the same way.
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
import type { StorageBackend } from '../storage/types.js'
import type { Tool } from '../types.js'

export interface HuoziToolRegistry {
  readonly tools: readonly Tool<any, any>[]
  get(name: string): Tool<any, any> | undefined
}

export function createHuoziToolRegistry(deps: {
  storage: StorageBackend
}): HuoziToolRegistry {
  const { storage } = deps
  const tools: Tool<any, any>[] = [
    createReadTool({ storage }),
    createEditTool({ storage }),
    createWriteTool({ storage }),
    createGlobTool({ storage }),
    createGrepTool({ storage }),
    createBatchEditTool({ storage }),
    createHistoryTool({ storage }),
  ]
  const byName = new Map<string, Tool<any, any>>()
  for (const t of tools) byName.set(t.name, t)

  return {
    tools,
    get(name) {
      return byName.get(name)
    },
  }
}
