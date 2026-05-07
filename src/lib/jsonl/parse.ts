/**
 * JSONL parsing for Collection files. See `app/docs/four-types.md` §3.
 *
 * Two line kinds:
 *   - **Entity events** — must have `id`; everything else is soft.
 *   - **Schema events** — `op:"schema"`, no `id`, payload under `schema`.
 *     They configure how the file should be rendered (field types,
 *     filters, layout slots). Multiple are allowed; later events
 *     deep-merge over earlier ones (see `fold.foldSchema`).
 *
 * Lines that are not valid JSON, are not objects, or are entity events
 * lacking `id`, are reported as parse errors but do not throw —
 * Collection files in the wild may have stray blank lines, BOMs, or
 * partial writes, and the renderer should degrade gracefully.
 */

/**
 * One entity-event line. The four conventional fields (`id`, `at`, `by`,
 * `op`) are surfaced explicitly; everything else lives in `fields`.
 * We keep `fields` distinct from the raw JSON object so the four
 * conventions render consistently regardless of how the author ordered
 * keys.
 */
export interface CollectionLine {
  /** 1-based line number within the source file. */
  lineNumber: number;
  /** The exact source bytes of this line (post-BOM-strip, no trailing
   *  newline). Round-tripping into a `huozi_edit` requires the original
   *  bytes — re-serializing `raw` would normalize whitespace and drop
   *  authoring choices. */
  originalText: string;
  /** Required identity. */
  id: string;
  /** Optional RFC 3339 timestamp string (kept as-is, not parsed). */
  at?: string;
  /** Optional actor (e.g. "user:alice", "agent:claude"). */
  by?: string;
  /** Optional business verb (e.g. "create", "ship", "refund_request"). */
  op?: string;
  /** Everything else from the JSON object, with the four conventions removed. */
  fields: Record<string, unknown>;
  /** The full original JSON object (including conventions) — useful for re-emit. */
  raw: Record<string, unknown>;
}

/**
 * One schema-event line. Schema events carry rendering configuration
 * for the Collection: which fields to show, what type each field is,
 * how to lay them out, what filters to expose. They have no `id` (the
 * config is about the file, not an entity) and use the reserved
 * `op:"schema"` verb. Multiple schema events accumulate via deep
 * merge, latest-write-wins (see `foldSchema`).
 */
export interface SchemaLine {
  /** 1-based line number within the source file. */
  lineNumber: number;
  /** The exact source bytes of this line (post-BOM-strip, no trailing newline). */
  originalText: string;
  /** Optional RFC 3339 timestamp; orders schemas chronologically. */
  at?: string;
  /** Optional actor who wrote this schema event. */
  by?: string;
  /** Optional integer version (informational; merge order is `at`-based). */
  version?: number;
  /** The schema config payload — open shape; see four-types.md §3.7. */
  schema: Record<string, unknown>;
  /** The full original JSON object — useful for re-emit / debugging. */
  raw: Record<string, unknown>;
}

export interface ParseError {
  lineNumber: number;
  /** The original line text (truncated if very long). */
  text: string;
  reason: "invalid-json" | "not-an-object" | "missing-id";
}

export interface ParseResult {
  lines: CollectionLine[];
  schemas: SchemaLine[];
  errors: ParseError[];
}

const MAX_ERROR_TEXT = 200;

/**
 * Parse the full contents of a Collection file.
 *
 * Blank lines (and lines that are only whitespace) are silently
 * skipped. A leading UTF-8 BOM, if present, is stripped. Any other
 * issue produces a `ParseError` row but does not stop parsing.
 */
export function parseJsonl(content: string): ParseResult {
  // Strip BOM if present — some editors / Windows tools insert one.
  const stripped =
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  const rawLines = stripped.split(/\r?\n/);
  const lines: CollectionLine[] = [];
  const schemas: SchemaLine[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const text = rawLines[i]!;
    const lineNumber = i + 1;

    if (text.trim().length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      errors.push({
        lineNumber,
        text: truncate(text),
        reason: "invalid-json",
      });
      continue;
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      errors.push({
        lineNumber,
        text: truncate(text),
        reason: "not-an-object",
      });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const at = typeof obj.at === "string" ? obj.at : undefined;
    const by = typeof obj.by === "string" ? obj.by : undefined;
    const op = typeof obj.op === "string" ? obj.op : undefined;

    // Schema event — special control record. No `id` required because
    // the config is about the file, not an entity.
    if (op === "schema") {
      const version =
        typeof obj.version === "number" ? obj.version : undefined;
      const schemaPayload =
        obj.schema &&
        typeof obj.schema === "object" &&
        !Array.isArray(obj.schema)
          ? (obj.schema as Record<string, unknown>)
          : {};
      schemas.push({
        lineNumber,
        originalText: text,
        at,
        by,
        version,
        schema: schemaPayload,
        raw: obj,
      });
      continue;
    }

    const id = obj.id;
    if (typeof id !== "string" || id.length === 0) {
      errors.push({
        lineNumber,
        text: truncate(text),
        reason: "missing-id",
      });
      continue;
    }

    // `fields` excludes the four conventions so the renderer can show
    // them in dedicated chrome (badge, byline, op chip) and the
    // remaining payload in the body.
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      if (k === "id" || k === "at" || k === "by" || k === "op") continue;
      fields[k] = obj[k];
    }

    lines.push({
      lineNumber,
      originalText: text,
      id,
      at,
      by,
      op,
      fields,
      raw: obj,
    });
  }

  return { lines, schemas, errors };
}

function truncate(s: string): string {
  if (s.length <= MAX_ERROR_TEXT) return s;
  return s.slice(0, MAX_ERROR_TEXT) + "…";
}

/**
 * Group lines by `id`, preserving the order each id first appeared.
 * Within each group, lines stay in the order they appeared in the file
 * (which, for well-formed Collection files, is `at`-ascending).
 */
export function groupById(
  lines: CollectionLine[],
): Map<string, CollectionLine[]> {
  const groups = new Map<string, CollectionLine[]>();
  for (const ln of lines) {
    let bucket = groups.get(ln.id);
    if (!bucket) {
      bucket = [];
      groups.set(ln.id, bucket);
    }
    bucket.push(ln);
  }
  return groups;
}

/**
 * Sort lines by `at`, with lines lacking `at` falling back to file
 * order (lineNumber). Stable sort.
 */
export function sortByAt(lines: CollectionLine[]): CollectionLine[] {
  // Pair with original index for stable behavior on ties / missing `at`.
  const pairs = lines.map((line, i) => ({ line, i }));
  pairs.sort((a, b) => {
    const aAt = a.line.at;
    const bAt = b.line.at;
    if (aAt && bAt) {
      if (aAt < bAt) return -1;
      if (aAt > bAt) return 1;
      return a.i - b.i;
    }
    // Lines without `at` fall back to line-number order.
    if (!aAt && !bAt) return a.line.lineNumber - b.line.lineNumber;
    // Lines with `at` come before lines without. (Either choice is
    // defensible; this one keeps the timeline coherent for partially
    // annotated files.)
    return aAt ? -1 : 1;
  });
  return pairs.map((p) => p.line);
}

/** Distinct ids in the order they first appeared. */
export function distinctIds(lines: CollectionLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ln of lines) {
    if (!seen.has(ln.id)) {
      seen.add(ln.id);
      out.push(ln.id);
    }
  }
  return out;
}
