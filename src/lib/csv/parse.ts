/**
 * RFC 4180-ish CSV/TSV parser.
 *
 * Handles: quoted fields, escaped quotes (""), embedded commas and newlines
 * inside quoted fields, CRLF and LF line endings, trailing newline.
 *
 * Does not handle: streaming (entire text held in memory), BOM stripping is
 * done once up front, custom escape chars.
 */

export function parseDelimited(text: string, delim = ","): string[][] {
  return parseDelimitedWithSpans(text, delim).values;
}

/** [startOffset, endOffset] byte range of a single cell in the original
 *  source (post-BOM-strip). End is exclusive. The range covers the cell's
 *  raw bytes including any enclosing quotes — replacement of the range
 *  in the source preserves CSV grammar. */
export type CellSpan = [number, number];

export interface ParsedCsv {
  values: string[][];
  /** Per-row, per-column source byte spans, parallel to `values`. */
  spans: CellSpan[][];
  /** Bytes stripped from the head before parsing (0 or 1 — the BOM). Use
   *  this to translate spans back to the *original* (pre-strip) bytes when
   *  the caller needs to round-trip into a file edit. */
  bomBytes: number;
}

/**
 * Same parser as `parseDelimited` but also tracks the byte span of every
 * cell in the source. Used by the workspace inline-edit feature to map a
 * (rowIndex, colIndex) selection back to a unique substring for
 * `huozi_edit`. Independent function (rather than an opts argument) so
 * the hot zero-overhead read path stays untouched.
 */
export function parseDelimitedWithSpans(
  text: string,
  delim = ",",
): ParsedCsv {
  if (text.length === 0) return { values: [], spans: [], bomBytes: 0 };
  let bomBytes = 0;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    bomBytes = 1;
  }

  const rows: string[][] = [];
  const spans: CellSpan[][] = [];
  let row: string[] = [];
  let rowSpans: CellSpan[] = [];
  let field = "";
  let fieldStart = 0;
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"' && field.length === 0) {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === delim) {
      row.push(field);
      rowSpans.push([fieldStart, i]);
      field = "";
      i++;
      fieldStart = i;
      continue;
    }

    if (c === "\r") {
      row.push(field);
      rowSpans.push([fieldStart, i]);
      rows.push(row);
      spans.push(rowSpans);
      row = [];
      rowSpans = [];
      field = "";
      i += text[i + 1] === "\n" ? 2 : 1;
      fieldStart = i;
      continue;
    }

    if (c === "\n") {
      row.push(field);
      rowSpans.push([fieldStart, i]);
      rows.push(row);
      spans.push(rowSpans);
      row = [];
      rowSpans = [];
      field = "";
      i++;
      fieldStart = i;
      continue;
    }

    field += c;
    i++;
  }

  // Flush trailing field/row (only if there is content; avoids a bogus empty
  // row from a file that ends with a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rowSpans.push([fieldStart, i]);
    rows.push(row);
    spans.push(rowSpans);
  }

  return { values: rows, spans, bomBytes };
}

/** True when a value looks numeric (int, float, signed, scientific, percent). */
export function isNumeric(s: string): boolean {
  if (s.length === 0) return false;
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  // Strip a trailing % for percent-style columns.
  const body = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  // Allow thousands separators.
  const normalized = body.replace(/,/g, "");
  if (normalized.length === 0) return false;
  const n = Number(normalized);
  return Number.isFinite(n);
}

/**
 * For each column, decide whether it's predominantly numeric (for
 * right-alignment + numeric sort). Empty cells don't count.
 */
export function inferNumericColumns(
  rows: string[][],
  headerCount: number,
): boolean[] {
  const numeric = new Array<boolean>(headerCount).fill(false);
  if (rows.length === 0) return numeric;
  for (let col = 0; col < headerCount; col++) {
    let total = 0;
    let num = 0;
    for (let r = 0; r < rows.length; r++) {
      const v = rows[r]?.[col];
      if (v === undefined || v === "") continue;
      total++;
      if (isNumeric(v)) num++;
    }
    numeric[col] = total > 0 && num / total >= 0.8;
  }
  return numeric;
}
