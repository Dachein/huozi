/**
 * Map a stored Highlight (locator + text + prefix/suffix) back to a live
 * DOM Range. Returns null when the highlight can't be re-anchored — the
 * drawer surfaces those as "orphan" entries so the user knows the
 * underlying text moved.
 *
 * Resolution strategy:
 *
 *   1. **Locator-driven (preferred).**
 *      - `bytes`: find the smallest `[data-obj-src="s,e"]` block that
 *        covers the highlight's byte range, then walk its text nodes to
 *        build a Range over the corresponding rendered characters. The
 *        capture pipeline guarantees a narrowed slice equals plain text
 *        (no markdown markup), so a substring search inside the block
 *        produces an unambiguous match.
 *      - `jsonl-field`: locate the element marked
 *        `data-obj-src="jsonl:<line>:<field>"` and Range over its full
 *        textContent (v1 doesn't narrow jsonl highlights).
 *
 *   2. **Fuzzy fallback.** If the locator can't be honored (file edited,
 *      block missing), search the host's full textContent for
 *      `prefix + text + suffix`. Unique match → Range; otherwise orphan.
 */

import type { Highlight } from "@/lib/highlights/types"
import type { ObjectLocator } from "@/components/workspace/inline-edit"

export function resolveHighlightRange(
  host: HTMLElement,
  highlight: Highlight,
): Range | null {
  const primary = tryLocator(host, highlight.locator, highlight.text)
  if (primary) return primary
  return tryFuzzy(host, highlight.text, highlight.prefix, highlight.suffix)
}

function tryLocator(
  host: HTMLElement,
  locator: ObjectLocator,
  text: string,
): Range | null {
  if (locator.kind === "bytes") {
    return tryBytesLocator(host, locator.start, locator.end, text)
  }
  if (locator.kind === "jsonl-field") {
    return tryJsonlLocator(host, locator.lineNumber, locator.fieldKey)
  }
  return null
}

function tryBytesLocator(
  host: HTMLElement,
  start: number,
  end: number,
  capturedText: string,
): Range | null {
  const src = host.getAttribute("data-source")
  if (src === null) return null
  if (end > src.length) return null

  const block = findSmallestContainingBlock(host, start, end)
  if (!block) return null

  // The captured highlight stores the rendered text the user saw. The
  // source slice at [start, end) is what the locator points at — for a
  // narrowed highlight those are identical (substring narrowing only
  // accepts slices that match plain text). When the highlight covers a
  // whole block (no narrowing), the source slice may include markup;
  // fall back to ranging the entire block.
  const slice = src.slice(start, end)
  const blockText = block.textContent ?? ""

  if (slice === blockText) {
    return rangeOverElement(block)
  }
  // Locate the captured text inside the block. We use `capturedText`
  // (rendered) rather than `slice` (source bytes) because the source
  // may contain markup characters that the rendered text doesn't.
  const offset = blockText.indexOf(capturedText)
  if (offset === -1) return null
  // Ambiguity guard: if the text occurs more than once, we can't tell
  // which one to highlight. Drop to fuzzy fallback (which uses affixes).
  if (blockText.indexOf(capturedText, offset + 1) !== -1) return null
  return rangeOverTextOffsets(block, offset, offset + capturedText.length)
}

function tryJsonlLocator(
  host: HTMLElement,
  lineNumber: number,
  fieldKey: string,
): Range | null {
  // querySelector escaping for fieldKeys with special chars is fragile;
  // iterate instead.
  const wanted = `jsonl:${lineNumber}:${fieldKey}`
  const candidates = host.querySelectorAll<HTMLElement>("[data-obj-src]")
  for (const el of candidates) {
    if (el.getAttribute("data-obj-src") === wanted) {
      return rangeOverElement(el)
    }
  }
  return null
}

function tryFuzzy(
  host: HTMLElement,
  text: string,
  prefix: string,
  suffix: string,
): Range | null {
  if (text.length === 0) return null
  const full = host.textContent ?? ""
  // Try the full prefix+text+suffix window first — most discriminating.
  if (prefix || suffix) {
    const needle = prefix + text + suffix
    const idx = full.indexOf(needle)
    if (idx !== -1 && full.indexOf(needle, idx + 1) === -1) {
      const textStart = idx + prefix.length
      // The host might not be the right element to walk — text nodes can
      // be anywhere. We need to walk from host downward.
      return rangeOverTextOffsetsFromTextContent(
        host,
        textStart,
        textStart + text.length,
      )
    }
  }
  // Last resort: bare text. Only accept a unique match.
  const idx = full.indexOf(text)
  if (idx === -1) return null
  if (full.indexOf(text, idx + 1) !== -1) return null
  return rangeOverTextOffsetsFromTextContent(host, idx, idx + text.length)
}

// ── DOM walking helpers ─────────────────────────────────────────────────

/** All `[data-obj-src="s,e"]` elements whose byte range fully contains
 *  [start, end). Picks the smallest by source byte length — the most
 *  specific annotation. Returns null when nothing matches (the highlight
 *  predates a structural change to the source). */
function findSmallestContainingBlock(
  host: HTMLElement,
  start: number,
  end: number,
): HTMLElement | null {
  const candidates = host.querySelectorAll<HTMLElement>("[data-obj-src]")
  let best: HTMLElement | null = null
  let bestSize = Infinity
  for (const el of candidates) {
    const attr = el.getAttribute("data-obj-src")
    if (!attr) continue
    const m = /^(\d+),(\d+)$/.exec(attr)
    if (!m) continue
    const s = Number(m[1])
    const e = Number(m[2])
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue
    if (s <= start && e >= end) {
      const size = e - s
      if (size < bestSize) {
        best = el
        bestSize = size
      }
    }
  }
  return best
}

/** A Range covering an element's full text content. Uses selectNodeContents
 *  which honors descendant text/element nodes. */
function rangeOverElement(el: Element): Range {
  const r = document.createRange()
  r.selectNodeContents(el)
  return r
}

/** Build a Range over [startOffset, endOffset) measured as character
 *  offsets into the concatenated text of `root`'s descendants (i.e. the
 *  same numbering as `root.textContent`). */
function rangeOverTextOffsets(
  root: Element,
  startOffset: number,
  endOffset: number,
): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acc = 0
  let startNode: Text | null = null
  let startNodeOffset = 0
  let endNode: Text | null = null
  let endNodeOffset = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    const t = node as Text
    const len = t.data.length
    if (startNode === null && acc + len > startOffset) {
      startNode = t
      startNodeOffset = startOffset - acc
    }
    if (acc + len >= endOffset) {
      endNode = t
      endNodeOffset = endOffset - acc
      break
    }
    acc += len
    node = walker.nextNode()
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)
  return range
}

/** Same as `rangeOverTextOffsets` but the root is the topmost host so we
 *  walk every text node — used by the fuzzy fallback where we don't know
 *  which block contains the match. */
function rangeOverTextOffsetsFromTextContent(
  host: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  return rangeOverTextOffsets(host, startOffset, endOffset)
}
