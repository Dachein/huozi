/**
 * Project-detection helpers — v3.3 spec §1.2.
 *
 * "Is this folder a Project?" reduces to a single sentinel question:
 * does `<folder>/.huozi/memory.jsonl` exist? README.md alone is not
 * enough (every folder may have one); the memory file is the eager
 * artifact that the Upgrade flow mints.
 *
 * Both helpers are pure-read so they can be used from MCP tools, REST
 * endpoints, and the file-tree renderer without extra capabilities.
 */

import type { StorageBackend } from '../storage/types.js'

/** Path suffix that marks an upgraded Project. */
export const PROJECT_SENTINEL_SUFFIX = '.huozi/memory.md'

/**
 * Returns true iff `<folderPath>/.huozi/memory.jsonl` exists in the
 * workspace. Accepts trailing-slash or no-trailing-slash inputs. Does
 * not validate `folderPath` shape — caller should have canonicalised
 * (no `..`, leading slash stripped).
 */
export async function isProject(
  storage: StorageBackend,
  workspaceId: string,
  folderPath: string,
): Promise<boolean> {
  const trimmed = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath
  if (trimmed.length === 0) return false
  const sentinel = `${trimmed}/${PROJECT_SENTINEL_SUFFIX}`
  const file = await storage.readFile(workspaceId, sentinel)
  return file !== null
}

/**
 * Returns the list of top-level folder names that are upgraded
 * Projects. Implemented as a single full-workspace listFiles call
 * filtered to paths ending in the sentinel — cheaper than calling
 * `isProject` per folder, and it sidesteps a "list directories" API
 * the storage backend doesn't expose.
 *
 * Returns folder names sorted ascending. Names are top-level only —
 * `subdir/foo/.huozi/memory.jsonl` is silently ignored (we do not
 * support nested projects, per spec §1).
 */
export async function listProjects(
  storage: StorageBackend,
  workspaceId: string,
): Promise<string[]> {
  const entries = await storage.listFiles(workspaceId)
  const sentinel = `/${PROJECT_SENTINEL_SUFFIX}`
  const names = new Set<string>()
  for (const e of entries) {
    if (!e.path.endsWith(sentinel)) continue
    const stem = e.path.slice(0, -sentinel.length)
    // Skip nested: the stem must be a single segment with no `/`.
    if (stem.length === 0 || stem.includes('/')) continue
    names.add(stem)
  }
  return Array.from(names).sort()
}
