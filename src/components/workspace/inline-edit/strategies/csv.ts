/**
 * CSV / TSV strategy.
 *
 * Default object: one cell. Selection-driven entry is null — the grid
 * renders to canvas, so there's no DOM selection to resolve. CsvGrid
 * dispatches via `surface.requestEdit({ kind: 'csv-cell', … })` from
 * the row-detail modal cell click.
 *
 * Save: the user types the cell's parsed value (no surrounding quotes,
 * no escaped quotes). We CSV-encode per RFC 4180 — quote iff the value
 * contains the delimiter, a quote, CR, or LF; double internal quotes —
 * then anchor-expand the same way md/html do.
 */

import type { EditStrategy } from "./types";
import { expandToUnique } from "../anchor";

/** RFC 4180-ish CSV cell encoder. */
function csvEncodeCell(value: string, delim: string): string {
  const needsQuote =
    value.includes(delim) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  if (!needsQuote) return value;
  return '"' + value.replace(/"/g, '""') + '"';
}

export const csvStrategy: EditStrategy = {
  kind: "csv-cell",

  editorLanguage: null,

  buildEdit(object, userValue, source) {
    if (object.locator.kind !== "csv-cell") {
      return { error: "csv strategy expects csv-cell locator" };
    }
    const { start, end, delim } = object.locator;
    const editableNew = csvEncodeCell(userValue, delim);
    const anchor = expandToUnique(source, start, end);
    if (!anchor.isUnique) {
      return {
        error:
          "Couldn't pin this edit — the surrounding text repeats too much.",
      };
    }
    const old_string = source.slice(anchor.left, anchor.right);
    const new_string =
      source.slice(anchor.left, start) +
      editableNew +
      source.slice(end, anchor.right);
    return { old_string, new_string };
  },
};
