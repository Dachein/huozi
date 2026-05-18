"use client";

/**
 * Prev/next navigation across a (typically filtered) list of items,
 * given a currently-selected id. The companion hook to
 * <ListDetailLayout> — the layout consumes the returned navigator
 * shape, and any domain (collection, mail, …) can compute it from
 * its own data without re-implementing index math.
 *
 * `onSelect` fires with the id of the new entity; the caller is
 * responsible for updating selection state (and URL, if any). When
 * `currentId` isn't in `items` (e.g. selection cleared, or item
 * filtered out), goPrev / goNext are no-ops.
 */

import { useCallback, useMemo } from "react";

export interface EntityNavigator<T> {
  /** Index of currentId in items; -1 if not found. */
  index: number;
  prev: T | null;
  next: T | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

export function useEntityNavigator<T>(
  items: readonly T[],
  currentId: string | null,
  getId: (item: T) => string,
  onSelect: (id: string) => void,
): EntityNavigator<T> {
  const index = useMemo(() => {
    if (currentId === null) return -1;
    return items.findIndex((item) => getId(item) === currentId);
  }, [items, currentId, getId]);

  const prev = index > 0 ? (items[index - 1] ?? null) : null;
  const next =
    index >= 0 && index < items.length - 1 ? (items[index + 1] ?? null) : null;

  const goPrev = useCallback(() => {
    if (prev) onSelect(getId(prev));
  }, [prev, getId, onSelect]);

  const goNext = useCallback(() => {
    if (next) onSelect(getId(next));
  }, [next, getId, onSelect]);

  return {
    index,
    prev,
    next,
    canGoPrev: prev !== null,
    canGoNext: next !== null,
    goPrev,
    goNext,
  };
}
