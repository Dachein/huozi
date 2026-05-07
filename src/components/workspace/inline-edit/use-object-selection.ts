"use client";

/**
 * Watch DOM `selectionchange` events inside a host element and surface
 * "the user selected text inside an object" — where "object" is the
 * nearest ancestor element carrying a `data-obj-src="<start>,<end>"`
 * attribute.
 *
 * Used by the markdown + html renderers (the byte-range types). CSV and
 * JSONL skip this hook entirely — those renderers don't have selectable
 * source-mapped DOM (canvas grid / fold-time-derived chips), so they
 * dispatch `EditRequest` directly via the EditableSurface context.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ObjectSelectionInfo {
  /** Source byte range of the enclosing object. */
  objectStart: number;
  objectEnd: number;
  /** Plain text of the user's selection (a substring of the rendered DOM). */
  selectionText: string;
  /** Whether the selection covers the entire object's textContent — set
   *  by a double-click. UI uses this to decide between "edit selection"
   *  vs "edit whole object" modes. */
  isWholeObject: boolean;
  /** Bounding rect of the selection range — used to position the popover. */
  rect: { top: number; left: number; width: number; height: number };
}

const ATTR = "data-obj-src";

function findObjectAncestor(node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur) {
    if (cur.nodeType === 1) {
      const el = cur as HTMLElement;
      if (el.hasAttribute(ATTR)) return el;
    }
    cur = cur.parentNode;
  }
  return null;
}

function parseRange(value: string): [number, number] | null {
  const m = value.match(/^(\d+),(\d+)$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return [start, end];
}

/**
 * Subscribe to selection-change events scoped to `host`. Returns the
 * current selection if one exists inside an object; null otherwise.
 *
 * Returns a stable null reference when there's no selection so consumers
 * can rely on referential equality for popover dismissal.
 */
export function useObjectSelection(
  hostRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): ObjectSelectionInfo | null {
  const [info, setInfo] = useState<ObjectSelectionInfo | null>(null);
  const rafRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    rafRef.current = null;
    if (!enabled) {
      setInfo(null);
      return;
    }
    const host = hostRef.current;
    if (!host) {
      setInfo(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setInfo(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) {
      setInfo(null);
      return;
    }
    const objEl = findObjectAncestor(range.commonAncestorContainer);
    if (!objEl || !host.contains(objEl)) {
      setInfo(null);
      return;
    }
    const attr = objEl.getAttribute(ATTR);
    if (!attr) {
      setInfo(null);
      return;
    }
    const range2 = parseRange(attr);
    if (!range2) {
      setInfo(null);
      return;
    }
    const selectionText = sel.toString();
    if (selectionText.length === 0) {
      setInfo(null);
      return;
    }
    const objText = objEl.textContent ?? "";
    const isWholeObject =
      selectionText.trim().length > 0 &&
      objText.trim() === selectionText.trim();
    const rangeRect = range.getBoundingClientRect();
    setInfo({
      objectStart: range2[0],
      objectEnd: range2[1],
      selectionText,
      isWholeObject,
      rect: {
        top: rangeRect.top,
        left: rangeRect.left,
        width: rangeRect.width,
        height: rangeRect.height,
      },
    });
  }, [enabled, hostRef]);

  useEffect(() => {
    if (!enabled) return;
    function onChange() {
      // Coalesce noisy selectionchange bursts into one frame so we don't
      // thrash the popover position during a drag-select.
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(recompute);
    }
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, recompute]);

  return info;
}
