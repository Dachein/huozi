/**
 * Optimistic DOM patch — apply the user's edit to the rendered DOM
 * the moment they click Save, BEFORE the server POST completes. The
 * point: <50ms perceived save latency instead of 1–3s waiting on
 * Worker → D1 → SSR.
 *
 * Returns a `revert` function the caller can invoke if the POST
 * eventually fails. Revert restores the text node to its pre-patch
 * value. Returns null if no patch was applied (e.g. csv-cell, or no
 * matching DOM target — the caller doesn't need to do anything).
 *
 * Per-locator behavior:
 *   - bytes (md / html, including narrowed sub-object slices): find
 *     the smallest [data-obj-src] element fully containing the byte
 *     range, walk its text nodes, replace the old bytes with new.
 *     Works because the narrowing rule guarantees old bytes appear as
 *     plain text in DOM. Whole-object edits where source has markup
 *     syntax (`**bold**`) silently skip — no DOM match — and the
 *     refresh path takes over.
 *   - jsonl-field: target the field's data-obj-src span directly; swap
 *     its leaf text content.
 *   - csv-cell: noop. The CsvGrid renders to canvas, not DOM. The
 *     refresh path catches up.
 *
 * After server commit, the CloudLiveEvents WS broadcast triggers
 * `router.refresh()`, re-rendering with the canonical bytes. If the
 * patch matched the eventual server state (the common case) the
 * re-render is byte-identical — no flicker.
 */

import type { ObjectLocator } from "./types";

/** Rolls the patch back. Idempotent — calling twice has no extra effect. */
export type RevertFn = () => void;

export function applyOptimisticPatch(
  locator: ObjectLocator,
  newValue: string,
  source: string,
): RevertFn | null {
  if (typeof document === "undefined") return null;

  if (locator.kind === "bytes") {
    return patchByteRange(source, locator.start, locator.end, newValue);
  }

  if (locator.kind === "csv-cell") {
    // Canvas renderer — defer to router.refresh().
    return null;
  }

  if (locator.kind === "jsonl-field") {
    return patchJsonlField(locator.lineNumber, locator.fieldKey, newValue);
  }

  return null;
}

/**
 * Byte-range patch for md / html. Finds the smallest [data-obj-src]
 * element whose source range fully contains [start, end), then replaces
 * the first matching text node descendant. Returns a revert that
 * restores the original textContent.
 */
function patchByteRange(
  source: string,
  start: number,
  end: number,
  newValue: string,
): RevertFn | null {
  const oldBytes = source.slice(start, end);
  if (oldBytes === newValue) return null;

  const elements = document.querySelectorAll<HTMLElement>("[data-obj-src]");
  let best: HTMLElement | null = null;
  let bestSize = Infinity;
  for (const el of elements) {
    const attr = el.getAttribute("data-obj-src");
    if (!attr) continue;
    const m = attr.match(/^(\d+),(\d+)$/);
    if (!m) continue;
    const s = Number(m[1]);
    const e = Number(m[2]);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (s <= start && e >= end) {
      const size = e - s;
      if (size < bestSize) {
        best = el;
        bestSize = size;
      }
    }
  }
  if (!best) return null;

  // Walk text node descendants in document order; patch the first
  // node whose content contains our bytes. Sub-object narrowing
  // guarantees old bytes are pure text — no markup straddled — so a
  // simple text-node match holds.
  const walker = document.createTreeWalker(best, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.textContent ?? "";
    const idx = text.indexOf(oldBytes);
    if (idx !== -1) {
      const before = text.slice(0, idx);
      const after = text.slice(idx + oldBytes.length);
      const target = node;
      target.textContent = before + newValue + after;
      // Capture for revert. We intentionally don't snapshot the whole
      // node tree — only this text node's content. If something else
      // mutates it before revert fires, the revert may produce a weird
      // intermediate state, but that's strictly better than leaving
      // the user-visible UI in a stale-after-failed-save state.
      let reverted = false;
      return () => {
        if (reverted) return;
        reverted = true;
        target.textContent = before + oldBytes + after;
      };
    }
    node = walker.nextNode() as Text | null;
  }
  return null;
}

/**
 * JSONL field patch — the surface marks each editable field with
 * data-obj-src="jsonl:<lineNumber>:<fieldKey>"; we look up that exact
 * element and rewrite its leaf text node.
 */
function patchJsonlField(
  lineNumber: number,
  fieldKey: string,
  newValue: string,
): RevertFn | null {
  // CSS attribute selector — escape any quote in fieldKey defensively
  // (field names from arbitrary jsonl content theoretically can have
  // anything, though in practice they're plain identifiers).
  const safeKey = fieldKey.replace(/"/g, '\\"');
  const selector = `[data-obj-src="jsonl:${lineNumber}:${safeKey}"]`;
  const el = document.querySelector(selector);
  if (!el) return null;

  // Find the deepest text node — for plain string values the field
  // span renders as a single text node. For diff-peek modes there may
  // be strike-through siblings; replacing the LAST text node tracks
  // the "current value" rendering.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    if ((node.textContent ?? "").length > 0) last = node;
    node = walker.nextNode() as Text | null;
  }
  if (!last) return null;

  const target = last;
  const original = target.textContent ?? "";
  if (original === newValue) return null;
  target.textContent = newValue;

  let reverted = false;
  return () => {
    if (reverted) return;
    reverted = true;
    target.textContent = original;
  };
}
