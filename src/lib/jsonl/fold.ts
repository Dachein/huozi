/**
 * Fold Collection lines to current state. See `app/docs/four-types.md` §3.4.
 *
 * The current state of an entity is what you get by replaying every
 * line for that entity's `id` in `at` order, applying each line's
 * fields on top of the running record.
 *
 * For semantic-patch style files, the `op` field implicitly encodes a
 * status transition. We give a small built-in projector for the four
 * universal verbs (`create`, `update`, `delete`, `restore`); custom
 * verbs are passed through and merged like updates. The renderer can
 * surface `op` in the timeline view independently.
 */

import type { CollectionLine, SchemaLine } from "./parse";
import { groupById, sortByAt } from "./parse";

/**
 * Folded state of one entity, plus a soft-status derived from `op`.
 *
 * `state` carries the merged fields (everything appended over time).
 * `status` is one of the four universal lifecycle states the renderer
 * recognizes — `null` when no `op` ever specified one.
 */
export interface EntityState {
  id: string;
  /** Folded fields — `at` / `by` / `op` of the latest line, plus all merged payload. */
  state: Record<string, unknown>;
  /** Universal lifecycle marker derived from `op`. */
  status: "active" | "deleted" | null;
  /** All lines for this entity in chronological order. */
  history: CollectionLine[];
  /** Most-recent line — convenience for "last-touched at" UI. */
  latest: CollectionLine;
}

type Status = "active" | "deleted" | null;

/** Built-in projector: maps universal `op` values to status. Custom ops pass through. */
function applyOp(current: Status, op: string | undefined): Status {
  switch (op) {
    case "create":
    case "restore":
      return "active";
    case "delete":
      return "deleted";
    default:
      // `update` and any custom verb leave status unchanged. The custom
      // verb is still visible on the line itself in the stream / timeline
      // views; the fold just doesn't try to interpret it.
      return current;
  }
}

/**
 * Fold all lines into per-entity current state. Entities appear in the
 * order their first line appeared in the file.
 *
 * @param asOf  Optional ISO timestamp; lines with `at` strictly greater
 *              than this are excluded (point-in-time / time-travel).
 */
export function foldByEntity(
  lines: CollectionLine[],
  asOf?: string,
): EntityState[] {
  const filtered = asOf
    ? lines.filter((ln) => !ln.at || ln.at <= asOf)
    : lines;

  const groups = groupById(filtered);
  const out: EntityState[] = [];

  for (const [id, group] of groups) {
    const ordered = sortByAt(group);
    if (ordered.length === 0) continue;

    let merged: Record<string, unknown> = {};
    let status: Status = null;

    for (const ln of ordered) {
      // Apply the line's fields on top. Later lines override earlier
      // ones for any key they specify. We deliberately do NOT delete
      // keys that were absent on the latest line — partial-patch style
      // assumes "absent = unchanged".
      merged = { ...merged, ...ln.fields };
      // Carry `at` / `by` of the latest line into state for display.
      if (ln.at) merged.at = ln.at;
      if (ln.by) merged.by = ln.by;
      if (ln.op) merged.op = ln.op;
      status = applyOp(status, ln.op);
    }

    const latest = ordered[ordered.length - 1]!;
    out.push({
      id,
      state: merged,
      status,
      history: ordered,
      latest,
    });
  }

  return out;
}

/**
 * Fold for a single entity. Cheaper than building the whole map when
 * the user has clicked into one entity's timeline.
 */
export function foldEntity(
  lines: CollectionLine[],
  id: string,
  asOf?: string,
): EntityState | null {
  const subset = lines.filter((ln) => ln.id === id);
  if (subset.length === 0) return null;
  const all = foldByEntity(subset, asOf);
  return all[0] ?? null;
}

/**
 * Fold all schema events into one effective configuration. Schema
 * events are sorted by `at` (ties broken by line number, then by lines
 * lacking `at` falling back to file order) and deep-merged in
 * chronological order.
 *
 * **Merge semantics:** keys at every level are unioned; on key
 * conflict, the later schema wins. For nested objects (e.g.
 * `schema.fields`, `schema.entity`) the merge recurses, so a later
 * schema can add a single new field without restating the rest of the
 * config. Arrays are replaced wholesale (a later schema's
 * `list_view.filters` array fully overrides the earlier one) — array
 * concatenation is rarely the right semantics for config.
 *
 * Returns `null` when no schema events exist; the renderer should
 * degrade to the soft-schema default (id-as-title, field-union table).
 */
export function foldSchema(
  schemas: SchemaLine[],
): Record<string, unknown> | null {
  if (schemas.length === 0) return null;
  const sorted = [...schemas].sort((a, b) => {
    const aAt = a.at;
    const bAt = b.at;
    if (aAt && bAt) {
      if (aAt < bAt) return -1;
      if (aAt > bAt) return 1;
      return a.lineNumber - b.lineNumber;
    }
    if (!aAt && !bAt) return a.lineNumber - b.lineNumber;
    return aAt ? -1 : 1;
  });

  let merged: Record<string, unknown> = {};
  for (const s of sorted) {
    merged = deepMergeObjects(merged, s.schema);
  }
  return merged;
}

/**
 * Deep-merge two plain-object payloads. Later wins on scalar conflicts
 * and on array values; nested plain objects recurse. Not generic over
 * arbitrary class instances — schema payloads are JSON, so plain
 * objects + arrays + scalars are exhaustive.
 */
function deepMergeObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = out[key];
    if (isPlainObject(tv) && isPlainObject(sv)) {
      out[key] = deepMergeObjects(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Union of every top-level field key seen across all lines (excluding
 * the four conventions, which are surfaced separately). Order: most
 * common first; ties broken by first appearance.
 *
 * Used by the table view to choose columns: ranking by frequency keeps
 * the most informative columns leftmost without forcing the author to
 * declare a schema.
 */
export function fieldUnion(lines: CollectionLine[]): string[] {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    for (const k of Object.keys(ln.fields)) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (!firstSeen.has(k)) firstSeen.set(k, i);
    }
  }
  const keys = Array.from(counts.keys());
  keys.sort((a, b) => {
    const ca = counts.get(a)!;
    const cb = counts.get(b)!;
    if (ca !== cb) return cb - ca;
    return firstSeen.get(a)! - firstSeen.get(b)!;
  });
  return keys;
}
