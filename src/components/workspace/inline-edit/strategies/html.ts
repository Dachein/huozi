/**
 * HTML strategy.
 *
 * Default object: any element with a `data-obj-src` injected by
 * `lib/html/source-pos.ts` (every paired/void tag). Selection resolution
 * (LCA) lives in editable-surface.tsx; this file handles the save path.
 *
 * Save uses the same anchor-expansion as md — the user's bytes go in
 * verbatim, surrounded by enough original bytes to be globally unique.
 *
 * Inner-vs-whole-element scoping (so users can't accidentally delete
 * a `<strong>` open tag) is handled in editable-surface.tsx via
 * `findHtmlInnerRange` BEFORE the locator is built. By the time we
 * reach buildEdit, [start, end) already covers only the inner bytes.
 */

import type { EditStrategy } from "./types";
import { expandToUnique } from "../anchor";

export const htmlStrategy: EditStrategy = {
  kind: "html-element",

  editorLanguage: "html",

  buildEdit(object, userValue, source) {
    if (object.locator.kind !== "bytes") {
      return { error: "html strategy expects bytes locator" };
    }
    const { start, end } = object.locator;
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
      userValue +
      source.slice(end, anchor.right);
    return { old_string, new_string };
  },
};
