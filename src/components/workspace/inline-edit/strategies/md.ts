/**
 * Markdown strategy.
 *
 * Default object: any `data-obj-src`-tagged element from
 * `lib/markdown/source-pos.ts` — block tags (p, li, td, h1-h6, …) and
 * inline tags (strong, em, a, code, …). Selection resolution runs the
 * generic LCA walk in editable-surface.tsx; this file only handles the
 * save path.
 *
 * Save: the EditableSurface gives us a `[start, end)` byte range over
 * the original markdown source. We expand outward via `expandToUnique`
 * until the slice is globally unique, so `huozi_edit`'s exact-string
 * semantics has a stable anchor even when the inner bytes (`bold`,
 * `[link](...)`) repeat elsewhere in the file.
 *
 * The user types markdown directly — `**bold**`, `[text](url)`, etc.
 * — so the modal value IS the bytes. No encoding/decoding needed.
 */

import type { EditStrategy } from "./types";
import { expandToUnique } from "../anchor";

export const mdStrategy: EditStrategy = {
  kind: "md-block",

  editorLanguage: "markdown",

  buildEdit(object, userValue, source) {
    if (object.locator.kind !== "bytes") {
      return { error: "md strategy expects bytes locator" };
    }
    const { start, end } = object.locator;
    const editableNew = userValue;
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
