/**
 * Highlight / clipping data model.
 *
 * Highlights are stored in a sidecar JSON file next to the source file
 * (e.g. `article.md` → `article.md.highlights.json`). The locator format
 * mirrors the inline-edit ObjectLocator so we can reuse the same DOM-↔-bytes
 * resolution that the editor pipeline already supports.
 */

import type { ObjectLocator } from "@/components/workspace/inline-edit"

/** Schema version for the sidecar file. Bump when the on-disk shape changes
 *  in a non-additive way. Readers should refuse versions they don't know. */
export const HIGHLIGHTS_SIDECAR_VERSION = 1

export interface Highlight {
  /** Stable id (ULID-ish). Used for delete / future cross-refs. */
  id: string
  /** Where in the source file the highlight lives. Same shape as
   *  ObjectLocator — for md/html this is a byte range over the source,
   *  for jsonl it's a structural pointer plus inner offsets. */
  locator: ObjectLocator
  /** The rendered plain text the user selected. Used as a sanity check at
   *  replay time and as the human-readable label in the drawer. */
  text: string
  /** Up to 30 chars of rendered plain text immediately before/after the
   *  selection — used as a fuzzy-match fallback when the source has been
   *  edited and `locator` no longer points at `text`. */
  prefix: string
  suffix: string
  /** Semantic color name (e.g. "accent"). Resolved to a CSS value by the
   *  theme layer so changing themes doesn't leave stale color values
   *  baked into the sidecar. */
  color: string
  /** Reserved for v2 — always empty string in v1. The drawer doesn't show
   *  an input for it yet, but keeping the field reserves the on-disk
   *  shape so we don't have to migrate later. */
  note: string
  /** ISO-8601 UTC timestamp. */
  createdAt: string
}

export interface HighlightsSidecar {
  version: typeof HIGHLIGHTS_SIDECAR_VERSION
  /** The source file this sidecar annotates, relative to workspace root.
   *  Stored explicitly so a sidecar file moved (or read out of context)
   *  still self-identifies. */
  source: string
  /** blob_sha of the source observed when the most recent highlight was
   *  captured. Drift is informational only (replay still attempts the
   *  locator + fuzzy fallback); the drawer can surface a "source has
   *  changed" hint when it differs from the live blob_sha. */
  sourceBlobSha: string | null
  highlights: Highlight[]
}

/** Compute the sidecar path for a given source file path. Keeps the rule in
 *  one place — change the suffix here and every read/write follows. */
export function sidecarPathFor(sourcePath: string): string {
  return `${sourcePath}.highlights.json`
}

/** True iff a path is itself a highlights sidecar. Used to hide sidecar
 *  files from the file tree / search results. */
export function isSidecarPath(path: string): boolean {
  return path.endsWith(".highlights.json")
}
