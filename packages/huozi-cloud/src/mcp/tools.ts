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
  createCollectionInitTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createHistoryTool,
  createReadTool,
  createWriteTool,
} from '../index.js'
import { createDownloadTool } from '../tools/DownloadTool.js'
import { createImageRenderTool } from '../tools/ImageRenderTool.js'
import { createListTreeTool } from '../tools/ListTreeTool.js'
import { createMemoryAppendTool } from '../tools/MemoryAppendTool.js'
import { createMemoryListTool } from '../tools/MemoryListTool.js'
import { createMkdirTool } from '../tools/MkdirTool.js'
import { createMvTool } from '../tools/MvTool.js'
import {
  createProjectArchiveTool,
  createProjectUnarchiveTool,
} from '../tools/ProjectArchiveTool.js'
import { createProjectUpgradeTool } from '../tools/ProjectUpgradeTool.js'
import { createRmTool } from '../tools/RmTool.js'
import { createShareTool, type ShareToolDeps } from '../tools/ShareTool.js'
import { createTemplateTool } from '../tools/TemplateTool/index.js'
import { createUploadTool } from '../tools/UploadTool/index.js'
import { createValidateTool } from '../tools/ValidateTool.js'
import { createWhoamiTool, type WhoamiToolDeps } from '../tools/WhoamiTool.js'
import type { BinaryRefSigner } from '../tools/ReadTool/ReadTool.js'
import type { SvgRenderer } from '../render/svgRenderer.js'
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
  /**
   * Enables `huozi_whoami`. Same story as shareDeps — needs D1 + the
   * authenticated principal/keyHash, which only the Worker entry has.
   */
  whoamiDeps?: WhoamiToolDeps
  /**
   * Enables real signed-URL emission for `huozi_read`'s binary_ref branch
   * and (when added) `huozi_download`. Without it, large reads return a
   * placeholder URL the agent can't actually fetch.
   */
  binarySigner?: BinaryRefSigner
  /**
   * Enables `huozi_image_render`. Worker entry wires the resvg-wasm
   * renderer; in-memory tests can pass a fake. Without it, the tool is
   * not registered (rendering is the whole point — degrading silently
   * would surprise agents).
   */
  svgRenderer?: SvgRenderer
}

export function createHuoziToolRegistry(
  deps: HuoziToolRegistryDeps,
): HuoziToolRegistry {
  const { storage, shareDeps, whoamiDeps, binarySigner, svgRenderer } = deps
  const tools: Tool<any, any>[] = [
    createReadTool({ storage, binarySigner }),
    createEditTool({ storage }),
    createWriteTool({ storage }),
    createCollectionInitTool({ storage }),
    createGlobTool({ storage }),
    createGrepTool({ storage }),
    createListTreeTool({ storage }),
    createBatchEditTool({ storage }),
    createHistoryTool({ storage }),
    createMkdirTool({ storage }),
    createRmTool({ storage }),
    createMvTool({ storage }),
    createTemplateTool(),
    createUploadTool({ storage }),
    createValidateTool({ storage }),
    createMemoryAppendTool({ storage }),
    createMemoryListTool({ storage }),
    createProjectUpgradeTool({ storage }),
    createProjectArchiveTool({ storage }),
    createProjectUnarchiveTool({ storage }),
  ]
  if (shareDeps) {
    tools.push(createShareTool(shareDeps))
  }
  if (whoamiDeps) {
    tools.push(createWhoamiTool(whoamiDeps))
  }
  // huozi_download is only meaningful when signed URLs work — no point
  // listing a tool whose every output is a placeholder URL.
  if (binarySigner) {
    tools.push(createDownloadTool({ storage, signer: binarySigner }))
  }
  // huozi_image_render needs a concrete renderer; without one, registering
  // the tool would mislead the agent.
  if (svgRenderer) {
    tools.push(createImageRenderTool({ storage, svgRenderer }))
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
