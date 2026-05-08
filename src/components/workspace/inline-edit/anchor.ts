/**
 * Helpers for the inline-edit save path.
 *
 * - `expandToUnique`: extend a byte range outward until its slice is
 *   globally unique in the source. The extended slice becomes
 *   `old_string` for huozi_edit; the surrounding bytes act as the
 *   anchor that pins the edit to a specific position.
 *
 * - `findHtmlInnerRange`: given the source bytes of a single HTML
 *   element (open tag through close tag), locate where the inner
 *   content starts and ends — i.e. the bytes between the > of the
 *   opening tag and the < of the closing tag.
 *
 * Both are pure / synchronous; the modal's save handler stitches them
 * together to convert "user typed N bytes inside element E" into a
 * uniquely-anchored old_string / new_string pair.
 */

const MAX_ANCHOR_RADIUS = 4096;

/**
 * Extend [start, end) outward until `source.slice(left, right)` appears
 * exactly once in `source`. Bails (returns the widest seen pair) when
 * the radius hits MAX_ANCHOR_RADIUS — at that point the caller should
 * abort the edit and tell the user to pick a more specific selection.
 *
 * The slice always contains [start, end). A return where the slice is
 * still non-unique can be detected by the caller via `isUnique`.
 */
export interface AnchorRange {
  left: number;
  right: number;
  isUnique: boolean;
}

export function expandToUnique(
  source: string,
  start: number,
  end: number,
): AnchorRange {
  if (start < 0 || end > source.length || start > end) {
    return { left: start, right: end, isUnique: false };
  }
  let left = start;
  let right = end;
  let radius = 0;

  // First check: maybe the inner slice is already unique.
  if (countOccurrences(source, source.slice(left, right)) === 1) {
    return { left, right, isUnique: true };
  }

  // Expand outward — alternate left and right by one byte each iteration
  // so the anchor grows symmetrically. Stop the moment uniqueness is
  // achieved, or hit the radius cap.
  while (radius < MAX_ANCHOR_RADIUS) {
    const grewLeft = left > 0;
    const grewRight = right < source.length;
    if (!grewLeft && !grewRight) break;
    if (grewLeft) left--;
    if (grewRight) right++;
    radius++;
    if (countOccurrences(source, source.slice(left, right)) === 1) {
      return { left, right, isUnique: true };
    }
  }
  return { left, right, isUnique: false };
}

/**
 * Count occurrences of `needle` in `haystack`. Used by `expandToUnique`;
 * exported for tests. Returns at most 2 (we only care whether the
 * slice is unique).
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const i = haystack.indexOf(needle, pos);
    if (i === -1) break;
    count++;
    if (count >= 2) return 2;
    pos = i + needle.length;
  }
  return count;
}

/**
 * Given the source slice of one HTML element (e.g. `<em class="x">hi</em>`),
 * return the byte offsets — relative to the slice's start — where the
 * inner content begins and ends.
 *
 * Returns `null` for slices that don't match a paired open/close tag
 * (void elements like `<br>`, self-closing `<input/>`, malformed
 * input). Callers should fall back to whole-element editing in that
 * case.
 */
export function findHtmlInnerRange(
  slice: string,
): { innerStart: number; innerEnd: number } | null {
  if (slice.length < 4) return null;
  if (slice[0] !== "<") return null;
  // Find the > that closes the open tag, honoring quoted attribute
  // values (which can themselves contain `>`).
  let i = 1;
  let inSingle = false;
  let inDouble = false;
  while (i < slice.length) {
    const c = slice[i];
    if (inSingle) {
      if (c === "'") inSingle = false;
    } else if (inDouble) {
      if (c === '"') inDouble = false;
    } else {
      if (c === "'") inSingle = true;
      else if (c === '"') inDouble = true;
      else if (c === ">") break;
    }
    i++;
  }
  if (i >= slice.length) return null;
  // Self-closing or void: no inner content.
  if (slice[i - 1] === "/") return null;
  const innerStart = i + 1;

  // The slice ends with `</tagname>` for paired elements. Walk backward
  // from end to find the `<` of the closing tag.
  if (slice[slice.length - 1] !== ">") return null;
  let j = slice.length - 2;
  while (j >= 0 && slice[j] !== "<") j--;
  if (j < 0) return null;
  if (slice[j + 1] !== "/") return null;
  const innerEnd = j;
  if (innerEnd < innerStart) return null;
  return { innerStart, innerEnd };
}
