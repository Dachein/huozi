/**
 * Per-page in-memory pub/sub for resolved highlights.
 *
 * The HighlightLayer (which already walks the DOM to resolve ranges)
 * publishes into this store; the drawer subscribes and reuses the same
 * resolved entries — including the (highlight → Range) mapping needed
 * to scroll to the source on click.
 *
 * Keeping it as a tiny event emitter (rather than React Context) means
 * the drawer can mount anywhere in the app shell without having to be a
 * descendant of EditableSurface. Both components agree on `sourcePath`
 * as the key.
 *
 * The store is reset implicitly when the layer unmounts (it publishes
 * an empty list on cleanup), so navigating between files doesn't leak
 * stale entries.
 */

import type { Highlight } from "@/lib/highlights/types";

export interface ResolvedHighlight {
  highlight: Highlight;
  /** null when the highlight couldn't be re-anchored — surfaced as an
   *  orphan entry in the drawer. */
  range: Range | null;
}

type Listener = (entries: ResolvedHighlight[]) => void;

const state = new Map<string, ResolvedHighlight[]>();
const listeners = new Map<string, Set<Listener>>();
// Stable empty-array reference. Returning a fresh `[]` from getHighlights
// would break useSyncExternalStore (it uses Object.is on snapshots).
const EMPTY: readonly ResolvedHighlight[] = Object.freeze([]);

export function publishHighlights(
  sourcePath: string,
  entries: ResolvedHighlight[],
): void {
  state.set(sourcePath, entries);
  const subs = listeners.get(sourcePath);
  if (subs) for (const fn of subs) fn(entries);
}

export function getHighlights(sourcePath: string): ResolvedHighlight[] {
  return state.get(sourcePath) ?? (EMPTY as ResolvedHighlight[]);
}

export function subscribeHighlights(
  sourcePath: string,
  fn: Listener,
): () => void {
  let subs = listeners.get(sourcePath);
  if (!subs) {
    subs = new Set();
    listeners.set(sourcePath, subs);
  }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) listeners.delete(sourcePath);
  };
}
