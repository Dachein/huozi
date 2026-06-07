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

/**
 * Two naming conventions encode two distinct semantics, deliberately kept as
 * two functions (mirrored verbatim in `miniapp/utils/file-types.js`):
 *
 * `isSystemPath` — a "." dot prefix means hidden machine state the user never
 * browses. Four families:
 *   ① any path segment starting with "." — `.huozi/*` (memory, clippings),
 *      `.huozi-keep` folder markers.
 *   ② root `inbox.jsonl` — the mail store (segs.length === 1).
 *   ③ anything under the root `tasks/` dir — huozi-bridge task records
 *      (segs[0] === "tasks" && segs.length > 1; hidden, not deleted).
 *   ④ `<project>/tasks.jsonl` — project task store, where `<project>` is a
 *      folder carrying `.huozi/memory.md` (passed in via `projectFolders`).
 *
 * Deliberately NOT a bare-basename blacklist: `mail-threads`, `threads`,
 * `modules`, `schema`, `people` look system-y but are user content.
 */
export function isSystemPath(
  path: string,
  projectFolders?: ReadonlySet<string> | readonly string[],
): boolean {
  if (!path) return false;
  const segs = path.split("/");
  for (const s of segs) {
    if (s.charAt(0) === ".") return true; // ① dot segment
  }
  const base = segs[segs.length - 1];
  if (segs.length === 1 && base === "inbox.jsonl") return true; // ② root mail
  if (segs[0] === "tasks" && segs.length > 1) return true; // ③ root tasks/
  if (base === "tasks.jsonl") {
    // ④ project task store
    const parent = segs.slice(0, -1).join("/");
    const inProject =
      projectFolders instanceof Set
        ? projectFolders.has(parent)
        : Array.isArray(projectFolders)
          ? projectFolders.includes(parent)
          : false;
    if (inProject) return true;
  }
  return false;
}

/**
 * `isAssetPath` — a "__x__" dunder segment is a reserved system namespace that
 * is nonetheless *visible* / referenceable (`__assets__/` material is wired
 * into 22 HTML `<img>` sources). Kept separate from `isSystemPath` on purpose:
 * the web surfaces assets via dedicated routes (the file-tree SYSTEM_DIRS and
 * the recent "assets" tab), so assets must NOT be classified as hidden junk.
 */
export function isAssetPath(path: string): boolean {
  if (!path) return false;
  return path.split("/").some((s) => /^__.+__$/.test(s));
}
