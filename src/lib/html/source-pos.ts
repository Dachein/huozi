/**
 * Inject `data-obj-src="<startByte>,<endByte>"` into every open tag of an
 * HTML string. The attribute's offsets refer to the **original** input
 * bytes (not the post-injection offsets), so a client that has the
 * original source can do `source.slice(start, end)` to recover the
 * element's exact bytes for `huozi_edit`.
 *
 * Powers the workspace inline-edit feature for `.html` files. The
 * existing `processHtmlDirect` sanitizer (string-rewrite, no AST) does
 * not strip arbitrary attributes — `data-*` survives unchanged — so this
 * pre-pass slots in cleanly without sanitizer changes.
 *
 * For paired tags (`<div>...</div>`): the span covers from the start of
 * `<div>` to the end of `</div>`.
 *
 * For void elements (`<br>`, `<img>`, …): the span covers just the open
 * tag's bytes.
 *
 * Tag-content state-machine handles `<script>`, `<style>`, `<textarea>`,
 * `<title>` (textual contents may contain `<` that aren't tags) and
 * comments / CDATA. Mismatched close tags are silently skipped (HTML5
 * parsers are forgiving; we mirror that).
 */

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAWTEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

// Matches a `class` attribute (quoted, apostrophed, or bareword) whose
// value contains the token `mermaid`.
const MERMAID_CLASS_RE =
  /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

interface Insert {
  /** Position in the original string at which to splice. Always points
   *  to the byte-offset of the `>` that closes the opening tag (or the
   *  `/>` for self-closing). The injected attribute is placed just
   *  before that byte. */
  pos: number;
  /** Pre-built attribute string, including the leading space. */
  attr: string;
}

/**
 * Inject `data-obj-src` into every open tag. Returns a new HTML string
 * where each element's open tag has the attribute pointing to its bounds
 * in the **original** input.
 */
export function injectSourcePositions(input: string): string {
  if (input.length === 0) return input;

  // Stack of currently-open elements: their tag name + the byte offset
  // of the `<` of their open tag (start of element span) + the byte
  // offset of the `>` of their open tag (where to inject the attribute).
  interface OpenEntry {
    tagName: string;
    openStart: number;
    openTagEnd: number;
  }
  const stack: OpenEntry[] = [];

  // Insertions queued for application in pass 2.
  const inserts: Insert[] = [];

  const n = input.length;
  let i = 0;

  while (i < n) {
    const ch = input[i];

    // Comment <!-- ... -->
    if (ch === "<" && input.startsWith("!--", i + 1)) {
      const end = input.indexOf("-->", i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }

    // CDATA / DOCTYPE / declaration <! ... >
    if (ch === "<" && input[i + 1] === "!") {
      const end = input.indexOf(">", i + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    // Processing instruction <? ... ?>
    if (ch === "<" && input[i + 1] === "?") {
      const end = input.indexOf("?>", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }

    // Close tag </name>
    if (ch === "<" && input[i + 1] === "/") {
      const nameStart = i + 2;
      let j = nameStart;
      while (j < n && /[A-Za-z0-9-]/.test(input[j]!)) j++;
      const tagName = input.slice(nameStart, j).toLowerCase();
      // Skip whitespace then expect >
      while (j < n && input[j] !== ">") j++;
      const closeTagEnd = j < n ? j + 1 : n; // exclusive end-of-element
      // Pop the matching entry from the stack — naive same-name match.
      // For mismatched HTML, walk down until we find a match (mirrors
      // browser-style fault tolerance) but if none, skip emission.
      let matchIdx = -1;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.tagName === tagName) {
          matchIdx = k;
          break;
        }
      }
      if (matchIdx >= 0) {
        const entry = stack[matchIdx]!;
        // Discard anything popped above the match (unclosed children) —
        // we don't emit data-obj-src for them.
        stack.length = matchIdx;
        inserts.push({
          pos: entry.openTagEnd,
          attr: ` data-obj-src="${entry.openStart},${closeTagEnd}"`,
        });
      }
      i = closeTagEnd;
      continue;
    }

    // Open tag <name ...> or <name ... />
    if (ch === "<" && /[A-Za-z]/.test(input[i + 1] ?? "")) {
      const openStart = i;
      const nameStart = i + 1;
      let j = nameStart;
      while (j < n && /[A-Za-z0-9-]/.test(input[j]!)) j++;
      const tagName = input.slice(nameStart, j).toLowerCase();

      // Walk attributes — handle quoted values containing `>`.
      let inSingle = false;
      let inDouble = false;
      while (j < n) {
        const c = input[j];
        if (inSingle) {
          if (c === "'") inSingle = false;
        } else if (inDouble) {
          if (c === '"') inDouble = false;
        } else {
          if (c === "'") inSingle = true;
          else if (c === '"') inDouble = true;
          else if (c === ">") break;
        }
        j++;
      }
      if (j >= n) {
        // Unterminated open tag — bail.
        i = n;
        continue;
      }
      const isSelfClosing = input[j - 1] === "/";
      // Position to insert the attribute: just before the `>` (or the
      // `/` for self-closing).
      const insertPos = isSelfClosing ? j - 1 : j;
      const openTagEnd = j + 1; // exclusive end of `<...>`

      if (VOID_TAGS.has(tagName) || isSelfClosing) {
        // Void/self-closing element: span = the open tag itself.
        inserts.push({
          pos: insertPos,
          attr: ` data-obj-src="${openStart},${openTagEnd}"`,
        });
      } else {
        stack.push({
          tagName,
          openStart,
          openTagEnd: insertPos,
        });
      }

      // `<pre class="mermaid">` and `<div class="mermaid">` blocks contain
      // diagram source as text, but authors commonly include literal `<br/>`
      // (and other tag-shaped tokens) that mermaid treats as part of its
      // mini-syntax — notably inside flowchart node labels. Recursing into
      // the body would inject `data-obj-src` onto those tokens, corrupting
      // the diagram source by the time mermaid reads it. Mermaid v10
      // accepts both container tags interchangeably, so the exemption
      // matches either.
      const isMermaidContainer =
        (tagName === "pre" || tagName === "div") &&
        !isSelfClosing &&
        (() => {
          const openTag = input.slice(openStart, openTagEnd);
          const m = openTag.match(MERMAID_CLASS_RE);
          if (!m) return false;
          const cls = m[1] ?? m[2] ?? m[3] ?? "";
          return /\bmermaid\b/.test(cls);
        })();

      // For raw-text containers, fast-forward to the matching close.
      if ((RAWTEXT_TAGS.has(tagName) || isMermaidContainer) && !isSelfClosing) {
        const close = `</${tagName}`;
        const closeIdx = indexOfCaseInsensitive(input, close, openTagEnd);
        if (closeIdx < 0) {
          // No close — treat element as running to end of input.
          i = n;
          continue;
        }
        // Move cursor to the `<` of the close tag so the next loop pass
        // handles it via the close-tag branch.
        i = closeIdx;
        continue;
      }

      i = openTagEnd;
      continue;
    }

    i++;
  }

  // Anything still on the stack was never closed — emit a span that
  // ends at end-of-input so those elements are still addressable.
  for (let k = stack.length - 1; k >= 0; k--) {
    const entry = stack[k]!;
    inserts.push({
      pos: entry.openTagEnd,
      attr: ` data-obj-src="${entry.openStart},${n}"`,
    });
  }

  if (inserts.length === 0) return input;

  // Apply insertions left-to-right by walking once with a sorted index.
  inserts.sort((a, b) => a.pos - b.pos);
  const out: string[] = [];
  let cursor = 0;
  for (const ins of inserts) {
    out.push(input.slice(cursor, ins.pos));
    out.push(ins.attr);
    cursor = ins.pos;
  }
  out.push(input.slice(cursor));
  return out.join("");
}

function indexOfCaseInsensitive(
  haystack: string,
  needleLower: string,
  fromIndex: number,
): number {
  const upper = needleLower.toUpperCase();
  const i1 = haystack.indexOf(needleLower, fromIndex);
  const i2 = haystack.indexOf(upper, fromIndex);
  if (i1 < 0) return i2;
  if (i2 < 0) return i1;
  return Math.min(i1, i2);
}
