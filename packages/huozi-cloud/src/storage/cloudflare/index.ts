/**
 * Cloudflare-backed storage + auth module barrel.
 *
 * Usage from the Worker entry:
 *
 *   import {
 *     CloudflareStorage, resolveBearer,
 *     HuoziWorkspaceDO, HuoziSessionDO,
 *   } from 'huozi-cloud/storage/cloudflare'
 *
 * `HuoziWorkspaceDO` / `HuoziSessionDO` must be re-exported from the Worker's
 * own entry module so wrangler can bind them as classes.
 */

export type { HuoziCloudflareBindings } from './bindings.js'
export { CloudflareStorage } from './storage.js'
export { resolveBearer } from './auth.js'
export type { AuthResult, AuthFailure } from './auth.js'
export { HuoziWorkspaceDO } from './workspace-do.js'
export { HuoziSessionDO } from './session-do.js'
export type { ReadFileStateSnapshot } from './session-do.js'
export {
  loadSessionState,
  persistSessionState,
} from './session-state.js'
export { sha256Hex } from './sha.js'
