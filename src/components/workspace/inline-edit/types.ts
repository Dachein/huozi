/**
 * Types shared between the EditableSurface, the per-renderer adapters
 * (CsvGrid, CollectionView), and the EditModal.
 *
 * The "object" is the editable unit per file type:
 *   - md-block      → a markdown block element (paragraph, list item, …)
 *   - html-element  → the smallest enclosing HTML element
 *   - csv-cell      → a single cell in a CSV/TSV file
 *   - jsonl-field   → a single field on the entity's latest line
 */

export type ObjectKind =
  | "md-block"
  | "html-element"
  | "csv-cell"
  | "jsonl-field";

/**
 * Type-discriminated locator: how the save flow finds & replaces the object
 * in the source file.
 *
 *   bytes        → md / html / csv: replace `source.slice(start, end)` with new bytes
 *   jsonl-field  → jsonl: replace the line at `lineNumber` with a re-serialized JSON
 *                  obtained by setting `fieldKey` to the new value on the line's raw obj
 */
export type ObjectLocator =
  | { kind: "bytes"; start: number; end: number }
  /** CSV cell: like `bytes` but the modal CSV-encodes the user's new
   *  value (quoting if it contains the delim, quotes, or newlines), and
   *  reads the file's raw bytes for `old_string` — the user types the
   *  *parsed* value, not the quoted form. */
  | { kind: "csv-cell"; start: number; end: number; delim: string }
  | {
      kind: "jsonl-field";
      lineNumber: number;
      /** The raw line text — used as `old_string` directly. */
      lineText: string;
      /** The parsed object for that line (so we can override + re-stringify). */
      lineRaw: Record<string, unknown>;
      /** Which field is being edited. */
      fieldKey: string;
    };

/** A request to open the edit modal for a specific object. */
export interface EditRequest {
  objectKind: ObjectKind;
  /** The full source slice of the object (csv/md/html) OR the field's
   *  current value as a string (jsonl). What lands in the textarea by
   *  default. */
  initialText: string;
  locator: ObjectLocator;
  /** Optional anchor — when set, the modal positions near these
   *  coordinates (popover handoff). When omitted (csv-cell, jsonl-field
   *  flows where the renderer dispatches directly), the modal centers. */
  anchorRect?: { top: number; left: number; width: number; height: number };
}

/** What an EditableSurface exposes to descendant renderers. */
export interface EditableSurfaceContextValue {
  requestEdit(req: EditRequest): void;
  /** True iff the user can write to this file (UI gate; the server route
   *  enforces the real check). */
  canEdit: boolean;
}
