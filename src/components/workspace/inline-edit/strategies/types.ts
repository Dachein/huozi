/**
 * EditStrategy — per-type behavior for the inline-edit framework.
 *
 * The framework (EditableSurface, EditModal) is type-agnostic. Type-
 * specific decisions — how a DOM selection becomes an EditObject, how
 * the user's typed value becomes (old_string, new_string) — live here.
 *
 * See `docs/inline-edit.md` §4 for the framework contract.
 */

import type { ObjectKind, ObjectLocator } from "../types";

/** Resolved object handed to the modal — same shape as EditRequest minus
 *  the popover anchor (which is positioning concern only). */
export interface EditObject {
  objectKind: ObjectKind;
  /** What lands in the editor body's initial value. */
  initialText: string;
  locator: ObjectLocator;
}

/** Output of `buildEdit` — the bytes the BFF will hand to huozi_edit. */
export interface EditPayload {
  old_string: string;
  new_string: string;
}

/** Recoverable strategy error — surfaced to the user as a modal toast. */
export interface EditError {
  error: string;
}

export type EditResult = EditPayload | EditError;

export function isEditError(r: EditResult): r is EditError {
  return "error" in r;
}

export interface EditStrategy {
  kind: ObjectKind;

  /**
   * Convert the user's typed value (modal body's current state) into the
   * (old_string, new_string) pair sent to the server. `source` is the
   * full original file content the surface inlined into a `data-source`
   * attribute — strategies that operate on byte ranges read from it;
   * strategies that operate at line / structural level (jsonl) ignore it.
   *
   * Return `{ error }` to surface a friendly message and abort the save
   * (e.g. md/html "couldn't pin this edit" when the anchor expansion
   * runs past the radius cap).
   */
  buildEdit(
    object: EditObject,
    userValue: string,
    source: string,
  ): EditResult;

  /**
   * (Phase 2 — Step 5) Which CodeMirror language extension to load in
   * the editor body. Null = plain text (csv cell, jsonl field value).
   * Today's textarea ignores this; reserved.
   */
  editorLanguage?: "markdown" | "html" | null;
}
