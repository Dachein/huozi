/**
 * Turn a live DOM selection inside an EditableSurface into a Highlight
 * payload ready to POST. Shares the locator resolution + narrowing logic
 * with the edit flow — both want the same answer to "what source bytes
 * does this selection correspond to?".
 *
 * Kept separate from editable-surface.tsx so the React component stays
 * focused on UI orchestration; the byte-math + payload assembly is pure
 * and easy to unit-test.
 */

import type { ObjectLocator } from "./types";
import type { ObjectSelectionInfo } from "./use-object-selection";
import { findHtmlInnerRange } from "./anchor";
import type { Highlight } from "@/lib/highlights/types";

/** Captured payload from a selection, ready to send to the highlights
 *  API. Returns null when we can't construct a coherent locator (e.g.
 *  malformed jsonl line, source attribute missing). */
export interface CapturedHighlight {
  locator: ObjectLocator;
  /** Rendered plain text the user selected (NOT the source slice — for
   *  md/html those differ because of markup characters). */
  text: string;
  /** Up to 30 chars of rendered text immediately before/after the
   *  selection; fuzzy-match fallback if the locator drifts. */
  prefix: string;
  suffix: string;
}

const AFFIX_CHARS = 30;

export function captureHighlight(
  host: HTMLElement,
  sel: ObjectSelectionInfo,
  fileKind: "md-block" | "html-element" | "jsonl-field",
): CapturedHighlight | null {
  const locator = buildLocator(host, sel, fileKind);
  if (!locator) return null;
  const { prefix, suffix } = extractAffix(host, sel.selectionText);
  return { locator, text: sel.selectionText, prefix, suffix };
}

function buildLocator(
  host: HTMLElement,
  sel: ObjectSelectionInfo,
  fileKind: "md-block" | "html-element" | "jsonl-field",
): ObjectLocator | null {
  if (sel.kind === "jsonl-field") {
    if (fileKind !== "jsonl-field") return null;
    // Recover line text from the inlined source (mirrors editable-surface
    // logic — including the BOM strip CollectionView does at parse time).
    const source = host.getAttribute("data-source") ?? "";
    const stripped =
      source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const lines = stripped.split(/\r?\n/);
    const lineText = lines[sel.lineNumber - 1];
    if (lineText === undefined) return null;
    let lineRaw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(lineText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      lineRaw = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    return {
      kind: "jsonl-field",
      lineNumber: sel.lineNumber,
      lineText,
      lineRaw,
      fieldKey: sel.fieldKey,
    };
  }

  if (sel.kind !== "bytes") return null;
  const src = host.getAttribute("data-source");
  if (src === null) return null;

  // Mirror onPopoverClick: scope to inner-tag for HTML, otherwise use the
  // whole-object byte range. Skip md prefix stripping — keeping the
  // structural prefix in the locator means the highlight covers exactly
  // what the user dragged across (including a list marker if they pulled
  // back into the bullet).
  let editableStart = sel.objectStart;
  let editableEnd = sel.objectEnd;
  if (fileKind === "html-element") {
    const objectSrc = src.slice(editableStart, editableEnd);
    const inner = findHtmlInnerRange(objectSrc);
    if (inner) {
      editableStart = sel.objectStart + inner.innerStart;
      editableEnd = sel.objectStart + inner.innerEnd;
    }
  }

  // Try to narrow to the actual selection within the editable scope.
  // Uses plain-text substring search — only safe when the selection
  // lives in a single text node and matches uniquely. Otherwise fall
  // back to the whole-object range.
  const narrowed = tryNarrow(
    src,
    editableStart,
    editableEnd,
    sel.selectionText,
    sel.isWholeObject,
  );
  if (narrowed) {
    editableStart = narrowed.start;
    editableEnd = narrowed.end;
  }
  return { kind: "bytes", start: editableStart, end: editableEnd };
}

function tryNarrow(
  src: string,
  start: number,
  end: number,
  selectionText: string,
  isWholeObject: boolean,
): { start: number; end: number } | null {
  if (isWholeObject) return null;
  if (selectionText.length === 0) return null;
  const range = window.getSelection()?.rangeCount
    ? window.getSelection()!.getRangeAt(0)
    : null;
  if (!range) return null;
  if (range.commonAncestorContainer.nodeType !== Node.TEXT_NODE) return null;
  const scope = src.slice(start, end);
  const first = scope.indexOf(selectionText);
  if (first === -1) return null;
  if (scope.indexOf(selectionText, first + 1) !== -1) return null;
  return { start: start + first, end: start + first + selectionText.length };
}

/** Extract surrounding rendered text. Uses host.textContent (the entire
 *  rendered text in document order) — locates `selectionText` in it and
 *  slices ±AFFIX_CHARS. Approximate when the selection text appears more
 *  than once (we pick the first occurrence) — that's fine; affixes are a
 *  fuzzy-match fallback, not a primary key. */
function extractAffix(
  host: HTMLElement,
  selectionText: string,
): { prefix: string; suffix: string } {
  if (selectionText.length === 0) return { prefix: "", suffix: "" };
  const full = host.textContent ?? "";
  const idx = full.indexOf(selectionText);
  if (idx === -1) return { prefix: "", suffix: "" };
  const prefixStart = Math.max(0, idx - AFFIX_CHARS);
  const suffixEnd = Math.min(
    full.length,
    idx + selectionText.length + AFFIX_CHARS,
  );
  return {
    prefix: full.slice(prefixStart, idx),
    suffix: full.slice(idx + selectionText.length, suffixEnd),
  };
}

/** Build the JSON body for POST /api/app/drive/highlights. Public so the
 *  drawer's "duplicate / re-anchor" flows can call it later if needed. */
export function buildHighlightPayload(
  captured: CapturedHighlight,
  color: string = "accent",
): Highlight {
  return {
    id: makeId(),
    locator: captured.locator,
    // The captured passage is the note — clippings don't carry a
    // separate title (see Highlight.note doc on the type).
    note: captured.text,
    prefix: captured.prefix,
    suffix: captured.suffix,
    color,
    createdAt: new Date().toISOString(),
  };
}

function makeId(): string {
  // ULID-ish: time-prefixed for natural sort + crypto random suffix.
  const time = Date.now().toString(36).padStart(9, "0");
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const tail = Array.from(rand, (b) =>
    b.toString(36).padStart(2, "0"),
  ).join("");
  return `hl_${time}${tail}`;
}
