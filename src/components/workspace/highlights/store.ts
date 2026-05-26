/**
 * Per-page in-memory pub/sub for resolved highlights.
 *
 * The HighlightLayer (which already walks the DOM to resolve ranges)
 * publishes confirmed entries here; the drawer subscribes and reuses
 * them — including the (highlight → Range) mapping needed to scroll to
 * the source on click.
 *
 * On top of confirmed entries, the store carries a separate "pending"
 * list per sourcePath. Optimistic clip flows (see editable-surface
 * onClipClick → runOptimistic) push an entry into pending the moment
 * the user clicks Clip and pop it once the server commit has propagated
 * back through the layer's GET. `getHighlights` returns
 * `[...pending, ...confirmed]` so newly-clipped passages appear at the
 * top of the drawer instantly, before the network round-trip resolves.
 *
 * Keeping it as a tiny event emitter (rather than React Context) means
 * the drawer can mount anywhere in the app shell without having to be a
 * descendant of EditableSurface. Both components agree on `sourcePath`
 * as the key.
 *
 * The store is reset implicitly when the layer unmounts (it publishes
 * an empty confirmed list on cleanup), so navigating between files
 * doesn't leak stale entries. Pending entries are tied to RevertFns
 * returned by `addPendingEntry` — callers own their lifetime.
 */

import type { Highlight } from "@/lib/highlights/types";
import type { RevertFn } from "@/lib/optimistic/run-optimistic";

export interface ResolvedHighlight {
  highlight: Highlight;
  /** null when the highlight couldn't be re-anchored — surfaced as an
   *  orphan entry in the drawer. */
  range: Range | null;
}

type Listener = (entries: ResolvedHighlight[]) => void;

const confirmedState = new Map<string, ResolvedHighlight[]>();
const pendingState = new Map<string, ResolvedHighlight[]>();
// useSyncExternalStore compares snapshots with Object.is, so we cache
// the merged array per sourcePath and only rebuild it when one of the
// two underlying maps actually changes.
const mergedCache = new Map<string, ResolvedHighlight[]>();
const listeners = new Map<string, Set<Listener>>();
// Stable empty-array reference. Returning a fresh `[]` would break
// useSyncExternalStore.
const EMPTY: readonly ResolvedHighlight[] = Object.freeze([]);

function recompute(sourcePath: string): ResolvedHighlight[] {
  const pending = pendingState.get(sourcePath);
  const confirmed = confirmedState.get(sourcePath);
  const hasPending = pending && pending.length > 0;
  const hasConfirmed = confirmed && confirmed.length > 0;
  if (!hasPending && !hasConfirmed) {
    mergedCache.delete(sourcePath);
    return EMPTY as ResolvedHighlight[];
  }
  if (!hasPending) {
    mergedCache.set(sourcePath, confirmed!);
    return confirmed!;
  }
  if (!hasConfirmed) {
    mergedCache.set(sourcePath, pending!);
    return pending!;
  }
  // Dedup: once a clip lands on the confirmed side (same highlight id),
  // drop its pending twin from the merged view. Without this, the
  // window between "layer's GET returned" and "onCommitted's delayed
  // cleanup fires" briefly shows the same entry twice.
  const confirmedIds = new Set(confirmed!.map((c) => c.highlight.id));
  const livePending = pending!.filter((p) => !confirmedIds.has(p.highlight.id));
  const merged =
    livePending.length === 0 ? confirmed! : [...livePending, ...confirmed!];
  mergedCache.set(sourcePath, merged);
  return merged;
}

function notify(sourcePath: string, snapshot: ResolvedHighlight[]): void {
  const subs = listeners.get(sourcePath);
  if (subs) for (const fn of subs) fn(snapshot);
}

export function publishHighlights(
  sourcePath: string,
  entries: ResolvedHighlight[],
): void {
  confirmedState.set(sourcePath, entries);
  const merged = recompute(sourcePath);
  notify(sourcePath, merged);
}

/**
 * Insert a pending entry at the top of the drawer for `sourcePath`.
 * Returned RevertFn removes it. Use from optimistic-commit `applyLocal`
 * so the drawer reflects the new clip instantly; clear via the cleanup
 * passed to `onCommitted` once the layer has reloaded confirmed state.
 */
export function addPendingEntry(
  sourcePath: string,
  entry: ResolvedHighlight,
): RevertFn {
  const prev = pendingState.get(sourcePath) ?? [];
  // Newest pending first (matches the layer's -createdAt sort on the
  // confirmed side, so a mid-fly entry doesn't suddenly hop in order
  // when it becomes confirmed).
  pendingState.set(sourcePath, [entry, ...prev]);
  const merged = recompute(sourcePath);
  notify(sourcePath, merged);

  let reverted = false;
  return () => {
    if (reverted) return;
    reverted = true;
    const cur = pendingState.get(sourcePath);
    if (!cur) return;
    const remaining = cur.filter((e) => e !== entry);
    if (remaining.length === 0) {
      pendingState.delete(sourcePath);
    } else {
      pendingState.set(sourcePath, remaining);
    }
    const m = recompute(sourcePath);
    notify(sourcePath, m);
  };
}

export function getHighlights(sourcePath: string): ResolvedHighlight[] {
  const cached = mergedCache.get(sourcePath);
  if (cached) return cached;
  return recompute(sourcePath);
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
