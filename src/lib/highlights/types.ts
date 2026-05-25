/**
 * Highlight / clipping data model.
 *
 * Highlights are stored in a workspace-root Collection at
 * `clippings.jsonl` — schema-first, multi-entity, append-only. Each
 * clipping is one entity (`id`); the event log carries `create` and
 * `remove` ops on that entity. Mirrors the `inbox.jsonl` convention so
 * users get the standard CollectionView (list / detail / filter) for
 * free.
 *
 * The locator shape mirrors the inline-edit ObjectLocator so we share
 * DOM-↔-bytes resolution with the editor pipeline.
 */

import type { ObjectLocator } from "@/components/workspace/inline-edit"

/** Where the collection lives — under each user's private folder.
 *
 *  Per-user scope, not per-workspace: clippings are personal reading
 *  notes, not collaborative artifacts. The path is dot-prefixed so the
 *  file tree hides it by default; a folder-acl set `private` for the
 *  owner gates MCP reads at the server level.
 *
 *  The path is always computed from the authenticated principal —
 *  callers must use `clippingsFilePathFor(userId)` instead of taking
 *  a path from request input. */
export function clippingsFilePathFor(userId: string): string {
  return `.huozi/clippings/${userId}/clippings.jsonl`
}

/** Parent directory we apply the ACL to. Anything under this path is
 *  private to `userId` and won't appear in another member's MCP/drive
 *  responses. */
export function clippingsAclPathPrefix(userId: string): string {
  return `.huozi/clippings/${userId}/`
}

/** `op` values written to clippings.jsonl. `schema` is reserved for the
 *  schema line itself (handled by the jsonl parser, not appended by
 *  the clip / delete code paths). */
export type ClippingOp = "create" | "remove"

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

/** What lives in clippings.jsonl alongside the schema line. Each
 *  Highlight maps to one `create` event; deletes append a `remove` event
 *  for the same id (soft tombstone — preserves history). */
export interface HighlightWithSource extends Highlight {
  /** Workspace-relative path of the source file this clipping was
   *  captured from. Stored on every event so we can filter
   *  clippings.jsonl by source without a separate index. */
  sourcePath: string
  /** blob_sha observed at capture time. Drift indicator only — replay
   *  still tries the locator + fuzzy fallback regardless. */
  sourceBlobSha: string | null
}

/** True iff a path is a legacy highlights sidecar (pre-clippings.jsonl
 *  storage). Used to hide leftover files from the workspace tree. */
export function isSidecarPath(path: string): boolean {
  return path.endsWith(".highlights.json")
}
