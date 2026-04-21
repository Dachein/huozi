/**
 * Request-scoped ReadFileState backed by HuoziSessionDO.
 *
 * Flow per Worker request:
 *   1. `loadSessionState(sessionDOStub)` fetches the snapshot → builds an
 *      `InMemoryReadFileState` populated from it
 *   2. Tools mutate the in-memory state synchronously
 *   3. `persistSessionState(sessionDOStub, state)` pushes the snapshot back
 *
 * If the Worker invocation errors mid-way, we still persist a best-effort
 * snapshot of whatever tools committed before the error (callers wrap their
 * work in try/finally).
 */

import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ReadFileState, ReadFileStateEntry } from '../../types.js'
import type { ReadFileStateSnapshot } from './session-do.js'

export async function loadSessionState(
  sessionDO: DurableObjectStub,
): Promise<{ state: ReadFileState & { __dirty?: boolean }; snapshot: ReadFileStateSnapshot }> {
  const res = await sessionDO.fetch('https://session/snapshot', { method: 'GET' })
  if (!res.ok) {
    throw new Error(`session load failed: ${res.status}`)
  }
  const snap = (await res.json()) as ReadFileStateSnapshot
  const state = new InMemoryReadFileState()
  const entriesObj = snap.entries ?? {}
  for (const [k, raw] of Object.entries(entriesObj)) {
    // Defensive: older snapshots (pre-v0.6) stored `content` which blew the
    // DO 128 KB value limit after a few large reads. Strip it on load so the
    // next persist is content-free.
    const v: ReadFileStateEntry = {
      blob_sha: raw.blob_sha,
      readAt: raw.readAt,
      ...(raw.offset !== undefined ? { offset: raw.offset } : {}),
      ...(raw.limit !== undefined ? { limit: raw.limit } : {}),
    }
    state.set(k, v)
  }
  return { state, snapshot: snap }
}

export async function persistSessionState(
  sessionDO: DurableObjectStub,
  state: ReadFileState,
): Promise<void> {
  const entries: Record<string, ReadFileStateEntry> = {}
  for (const [k, v] of state.entries()) {
    entries[k] = v
  }
  const snap: ReadFileStateSnapshot = { entries, updatedAt: Date.now() }
  const res = await sessionDO.fetch('https://session/snapshot', {
    method: 'POST',
    body: JSON.stringify(snap),
    headers: { 'content-type': 'application/json' },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '?')
    throw new Error(`session save failed: ${res.status} ${txt}`)
  }
}
