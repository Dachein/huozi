/**
 * In-memory implementation of ReadFileState.
 *
 * For PoC + tests. Production uses a DurableObject-backed impl that persists
 * across Worker restarts. Both implement the same `ReadFileState` interface
 * (types.ts), so swapping is zero-touch for tools.
 */

import type { ReadFileState, ReadFileStateEntry } from '../types.js'

export class InMemoryReadFileState implements ReadFileState {
  private readonly map = new Map<string, ReadFileStateEntry>()

  get(path: string): ReadFileStateEntry | undefined {
    return this.map.get(path)
  }

  set(path: string, entry: ReadFileStateEntry): void {
    this.map.set(path, entry)
  }

  delete(path: string): void {
    this.map.delete(path)
  }

  clear(): void {
    this.map.clear()
  }

  entries(): IterableIterator<[string, ReadFileStateEntry]> {
    return this.map.entries()
  }

  /** Test helper: current size. */
  size(): number {
    return this.map.size
  }
}
