/**
 * Optimistic DOM patch — apply the user's edit to the rendered DOM
 * immediately after a successful save POST, before `router.refresh()`'s
 * SSR round-trip lands.
 *
 * The router.refresh path can take 300–1000+ ms (BFF → Worker → D1 read
 * → SSR → diff → commit), and on stale-replica reads it stretches into
 * multi-second territory. The optimistic patch makes the screen
 * change feel instant; the eventual refresh just confirms / corrects.
 *
 * Per-locator behavior:
 *   - bytes (md / html, including narrowed sub-object slices): find
 *     the smallest [data-obj-src] element fully containing the byte
 *     range, walk its text nodes, replace the old bytes with new.
 *     Works because the narrowing rule guarantees old bytes appear as
 *     plain text in DOM. Whole-object edits where source has markdown
 *     syntax (`**bold**`) silently skip — no DOM match — and the
 *     refresh path takes over.
 *   - jsonl-field: target the field's data-obj-src span directly; swap
 *     its leaf text content.
 *   - csv-cell: noop. The CsvGrid renders to canvas, not DOM. The
 *     refresh path catches up.
 *
 * Patch is best-effort: any unmatched case returns silently. The
 * eventual `router.refresh()` is the source of truth.
 */

import type { ObjectLocator } from "./types";

export function applyOptimisticPatch(
  locator: ObjectLocator,
  newValue: string,
  source: string,
): void {
  if (typeof document === "undefined") return;

  if (locator.kind === "bytes") {
    patchByteRange(source, locator.start, locator.end, newValue);
    return;
  }

  if (locator.kind === "csv-cell") {
    // Canvas renderer — defer to router.refresh().
    return;
  }

  if (locator.kind === "jsonl-field") {
    patchJsonlField(locator.lineNumber, locator.fieldKey, newValue);
    return;
  }
}

/**
 * Byte-range patch for md / html. Finds the smallest [data-obj-src]
 * element whose source range fully contains [start, end), then replaces
 * the first matching text node descendant.
 */
function patchByteRange(
  source: string,
  start: number,
  end: number,
  newValue: string,
): void {
  const oldBytes = source.slice(start, end);
  if (oldBytes === newValue) return;

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
  if (!best) return;

  // Walk text node descendants in document order; replace the first
  // node whose content contains our bytes. Sub-object narrowing
  // guarantees old bytes are pure text — no markup straddled — so a
  // simple text-node match holds.
  const walker = document.createTreeWalker(best, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.textContent ?? "";
    const idx = text.indexOf(oldBytes);
    if (idx !== -1) {
      node.textContent =
        text.slice(0, idx) + newValue + text.slice(idx + oldBytes.length);
      return;
    }
    node = walker.nextNode() as Text | null;
  }
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
): void {
  // CSS attribute selector — escape any quote in fieldKey defensively
  // (field names from arbitrary jsonl content theoretically can have
  // anything, though in practice they're plain identifiers).
  const safeKey = fieldKey.replace(/"/g, '\\"');
  const selector = `[data-obj-src="jsonl:${lineNumber}:${safeKey}"]`;
  const el = document.querySelector(selector);
  if (!el) return;

  // Find the deepest text node — for plain string values the field
  // span renders as a single text node. For diff-peek modes there may
  // be strike-through siblings; replacing the LAST text node tracks
  // the "current value" rendering (the one that survives after the
  // user closes peek).
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    if ((node.textContent ?? "").length > 0) last = node;
    node = walker.nextNode() as Text | null;
  }
  if (!last) return;
  last.textContent = newValue;
}
