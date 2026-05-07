/**
 * The four data-type categories huozi files fall into. See `app/docs/four-types.md`
 * for the product framing. This module is the single source of truth: the
 * onboarding cards, the file-tree filter chips, and the renderer dispatch all
 * read from here.
 */

export type FileType = "table" | "document" | "collection" | "page" | "other";

export interface FileTypeMeta {
  type: FileType;
  /** Extensions in this category, lowercase, no leading dot. */
  extensions: readonly string[];
  /** i18n key for the human-readable label. */
  labelKey: string;
}

export const FILE_TYPES: Readonly<Record<FileType, FileTypeMeta>> = {
  table: {
    type: "table",
    extensions: ["csv", "tsv"],
    labelKey: "ws.types.table",
  },
  document: {
    type: "document",
    extensions: ["md", "mdx"],
    labelKey: "ws.types.document",
  },
  collection: {
    type: "collection",
    extensions: ["jsonl"],
    labelKey: "ws.types.collection",
  },
  page: {
    type: "page",
    extensions: ["html", "htm"],
    labelKey: "ws.types.page",
  },
  other: {
    type: "other",
    extensions: [],
    labelKey: "ws.types.other",
  },
};

/** Canonical order for UI lists (matches the 4-type doc). */
export const FOUR_TYPES: readonly FileType[] = [
  "table",
  "document",
  "collection",
  "page",
];

/** Lowercase extension (no leading dot) of a path; "" if none. */
export function getExt(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0 || i === path.length - 1) return "";
  return path.slice(i + 1).toLowerCase();
}

/** Map a file path to its 4-type category. Unknown extensions → "other". */
export function getFileType(path: string): FileType {
  const ext = getExt(path);
  if (!ext) return "other";
  for (const meta of Object.values(FILE_TYPES)) {
    if (meta.extensions.includes(ext)) return meta.type;
  }
  return "other";
}

/** Subset of paths matching the given type. */
export function filterByType(paths: string[], type: FileType): string[] {
  return paths.filter((p) => getFileType(p) === type);
}
