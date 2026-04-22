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
  if (text.length === 0) return [];
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
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
      field = "";
      i++;
      continue;
    }

    if (c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }

    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }

    field += c;
    i++;
  }

  // Flush trailing field/row (only if there is content; avoids a bogus empty
  // row from a file that ends with a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
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
