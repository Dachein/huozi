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

/**
 * Attribute shapes the hook recognizes. The shape is the discriminator —
 * so the surface can branch its onPopoverClick without a separate hook
 * per file kind. New shapes (e.g. xlsx-cell, gltf-mesh-instance, …)
 * extend this union plus the parser below.
 */
export type ObjectSelectionInfo = SelectionRect &
  (
    | {
        /** Byte range — md / html. */
        kind: "bytes";
        objectStart: number;
        objectEnd: number;
      }
    | {
        /** Structural — jsonl field on a given line. */
        kind: "jsonl-field";
        lineNumber: number;
        fieldKey: string;
      }
  );

interface SelectionRect {
  /** Plain text of the user's selection (a substring of the rendered DOM). */
  selectionText: string;
  /** Whether the selection covers the entire object's textContent. UI
   *  uses this to decide between "edit selection" vs "edit whole object"
   *  modes. */
  isWholeObject: boolean;
  /** Bounding rect of the selection range — used to position the popover. */
  rect: { top: number; left: number; width: number; height: number };
  /** Lowercased tag name of the resolved object element (e.g. "li",
   *  "strong", "p"). The surface uses this to apply markup-specific
   *  trimming — e.g. strip a markdown list marker when the object is a
   *  `<li>`. Empty string for non-byte-range markers. */
  objTagName: string;
}

const ATTR = "data-obj-src";

/**
 * Decode a `data-obj-src` value into the shape its consumer needs.
 * Returns null on any unknown / malformed attribute so the caller can
 * gracefully drop the selection.
 */
function parseAttr(
  value: string,
):
  | { kind: "bytes"; objectStart: number; objectEnd: number }
  | { kind: "jsonl-field"; lineNumber: number; fieldKey: string }
  | null {
  // Byte range: "<startInt>,<endInt>"
  const numeric = value.match(/^(\d+),(\d+)$/);
  if (numeric) {
    const start = Number(numeric[1]);
    const end = Number(numeric[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
    return { kind: "bytes", objectStart: start, objectEnd: end };
  }
  // JSONL structural: "jsonl:<lineNumber>:<fieldKey>"
  // fieldKey may itself contain colons; only the first two are delimiters.
  const jsonl = value.match(/^jsonl:(\d+):(.+)$/);
  if (jsonl) {
    const lineNumber = Number(jsonl[1]);
    const fieldKey = jsonl[2]!;
    if (!Number.isFinite(lineNumber) || lineNumber < 1) return null;
    return { kind: "jsonl-field", lineNumber, fieldKey };
  }
  return null;
}

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

/**
 * Pick the "right" data-obj for a selection that may span multiple
 * objects. See `docs/inline-edit.md` §3.1.
 *
 *   1. If A === B               → A
 *   2. If A contains B          → A   (selection straddles smaller B inside A)
 *   3. If B contains A          → B
 *   4. Disjoint subtrees        → whichever comes first in document order
 *   5. One side null            → the non-null one
 *
 * This lets users select across a `<strong>` open boundary inside a
 * paragraph (LCA = `<p>`) or across two paragraphs (first one wins).
 */
export function resolveObject(
  a: HTMLElement | null,
  b: HTMLElement | null,
): HTMLElement | null {
  if (a === b) return a;
  if (!a) return b;
  if (!b) return a;
  if (a.contains(b)) return a;
  if (b.contains(a)) return b;
  // Disjoint — bit 4 of compareDocumentPosition is FOLLOWING (b follows a).
  // Hardcoded constant so this stays testable outside a DOM environment.
  const FOLLOWING = 0x04;
  const pos = a.compareDocumentPosition(b);
  return pos & FOLLOWING ? a : b;
}

/**
 * Block-level tag names whose `data-obj-src` covers a complete editable
 * unit in the source. When LCA returns an inline element but the
 * selection has escaped its bounds, we walk up to the nearest tag from
 * this list — that's the smallest scope guaranteed to be a coherent
 * thing the user can edit (a paragraph, a list item, a heading…) rather
 * than a half-spanned inline marker.
 *
 * Mirrors `BLOCK_TAGS_LIST` in `lib/markdown/source-pos.ts` so widening
 * lands on something the renderer actually annotated.
 */
const BLOCK_TAGS = new Set([
  "p",
  "li",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
]);

/**
 * If the resolved object doesn't fully contain the selection's two
 * endpoints, walk up to the nearest BLOCK-tagged ancestor (li, p,
 * heading, …) carrying `data-obj-src`. That's the smallest scope that
 * is a "complete unit" — the modal opens with the first whole block
 * the user touched. Selection that genuinely spans multiple sibling
 * blocks still degrades gracefully: the walk lands on the block
 * containing one endpoint, and the other endpoint's content is just
 * left alone (single-edit operates on one block at a time).
 *
 * Returns `resolved` unchanged when the selection is already fully
 * inside it (the common case for word-level edits inside `<strong>`),
 * or when no block ancestor exists.
 */
export function widenIfSelectionEscapes(
  resolved: HTMLElement | null,
  startContainer: Node,
  endContainer: Node,
): HTMLElement | null {
  if (!resolved) return null;
  if (
    resolved.contains(startContainer) &&
    resolved.contains(endContainer)
  ) {
    return resolved;
  }
  let cur: HTMLElement | null = resolved.parentElement;
  while (cur) {
    if (
      BLOCK_TAGS.has(cur.tagName.toLowerCase()) &&
      cur.hasAttribute(ATTR)
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return resolved;
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
    // Resolve the object via least-common-data-obj-ancestor (§3.1):
    // walk up from BOTH endpoints independently, then pick the LCA. This
    // handles `<strong>` nested in `<p>` (returns `<p>`) and selections
    // spanning two paragraphs (returns the first `<p>` in document
    // order). Falling back to `commonAncestorContainer` alone misses the
    // disjoint case — its container often lacks data-obj-src.
    const startObj = findObjectAncestor(range.startContainer);
    const endObj = findObjectAncestor(range.endContainer);
    const lca = resolveObject(startObj, endObj);
    // Widen to the nearest block ancestor when the resolved object is
    // an inline element but the selection has escaped it (cross-strong
    // selections, cross-list-item selections, etc.). See §3.1.
    const objEl = widenIfSelectionEscapes(
      lca,
      range.startContainer,
      range.endContainer,
    );
    if (!objEl || !host.contains(objEl)) {
      setInfo(null);
      return;
    }
    const attr = objEl.getAttribute(ATTR);
    if (!attr) {
      setInfo(null);
      return;
    }
    const decoded = parseAttr(attr);
    if (!decoded) {
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
    const rect = {
      top: rangeRect.top,
      left: rangeRect.left,
      width: rangeRect.width,
      height: rangeRect.height,
    };
    setInfo({
      ...decoded,
      selectionText,
      isWholeObject,
      rect,
      objTagName: objEl.tagName.toLowerCase(),
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
