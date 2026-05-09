/**
 * JSONL strategy — one (line, fieldKey) pair is an object.
 *
 * Save: instead of byte-range surgery, we replace the whole line with a
 * re-stringified JSON object that has `fieldKey` overridden. Spreading
 * preserves key order (V8 / modern JS guarantees insertion order for
 * string keys). `old_string` = the line as it appears in the file;
 * `new_string` = the re-serialized object.
 *
 * This means `huozi_edit` runs as a single line replacement — no
 * anchor expansion needed because line text is already long enough to
 * be unique in practice. If a user has two identical lines (same fields,
 * same values) huozi_edit will reject ambiguous and the modal surfaces
 * a friendly error.
 *
 * V1 limitation: only string-typed fields are editable. CollectionView
 * gates the request before it reaches us; this strategy assumes the
 * userValue is intended as a string.
 */

import type { EditStrategy } from "./types";

export const jsonlStrategy: EditStrategy = {
  kind: "jsonl-field",

  editorLanguage: null,

  buildEdit(object, userValue) {
    if (object.locator.kind !== "jsonl-field") {
      return { error: "jsonl strategy expects jsonl-field locator" };
    }
    const { lineText, lineRaw, fieldKey } = object.locator;
    const old_string = lineText;
    const nextRaw = { ...lineRaw, [fieldKey]: userValue };
    const new_string = JSON.stringify(nextRaw);
    return { old_string, new_string };
  },
};
