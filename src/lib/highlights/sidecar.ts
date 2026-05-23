/**
 * Server-side sidecar IO for highlights.
 *
 * Reads happen via `cloudRead` (no session needed — SSR style). Writes go
 * through the read-then-write pair `cloudReadForEdit` + `cloudWrite` so the
 * Worker's session DO carries the prior blob_sha across the two calls,
 * satisfying `huozi_write`'s Read-first invariant for updates.
 *
 * Brand-new sidecar files don't need the prior read — we attempt the
 * session-less write first and only fall back to read-then-write when the
 * Worker reports MODIFIED_SINCE_READ (errorCode 7) or NOT_READ_FIRST (6),
 * which means the sidecar already exists.
 */

import {
  cloudRead,
  cloudReadForEdit,
  cloudWrite,
  stripCatN,
  type McpResult,
} from "@/lib/drive/mcp-client"
import {
  HIGHLIGHTS_SIDECAR_VERSION,
  sidecarPathFor,
  type Highlight,
  type HighlightsSidecar,
} from "./types"

const ERR_FILE_NOT_FOUND = 4
const ERR_NOT_READ_FIRST = 6
const ERR_MODIFIED_SINCE_READ = 7

/** Result of loading a sidecar — distinguishes "no sidecar yet" from real
 *  errors so callers can render the empty state without surfacing a toast. */
export type LoadSidecarResult =
  | { kind: "ok"; sidecar: HighlightsSidecar }
  | { kind: "missing" }
  | { kind: "error"; code: number; message: string }

/**
 * Load a file's sidecar. Returns `missing` when the sidecar file doesn't
 * exist yet (the common case for files no one has highlighted).
 *
 * Treats parse errors as `error` rather than `missing` — a malformed
 * sidecar means data loss if we silently overwrite, so the UI should
 * surface it and let the user decide.
 */
export async function loadSidecar(
  key: string,
  sourcePath: string,
): Promise<LoadSidecarResult> {
  const path = sidecarPathFor(sourcePath)
  const res = await cloudRead(key, path)
  if (!res.ok) {
    if (res.errorCode === ERR_FILE_NOT_FOUND) return { kind: "missing" }
    return { kind: "error", code: res.errorCode, message: res.message }
  }
  const raw = res.data.file.content
  if (typeof raw !== "string") {
    return { kind: "error", code: 0, message: "sidecar has no content" }
  }
  const text = stripCatN(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return {
      kind: "error",
      code: 0,
      message: `sidecar JSON parse failed: ${(e as Error).message}`,
    }
  }
  const sidecar = coerceSidecar(parsed, sourcePath)
  if (!sidecar) {
    return { kind: "error", code: 0, message: "sidecar shape invalid" }
  }
  return { kind: "ok", sidecar }
}

/**
 * Append a new highlight to the sidecar, creating the file if needed.
 *
 * On success returns the updated sidecar (so the client can re-render
 * without a follow-up GET).
 *
 * Failure modes the caller should distinguish:
 *   - `code: ERR_MODIFIED_SINCE_READ` after a retry → genuine race
 *     (someone else wrote between our read and write); UI should refetch
 *     and ask the user to retry.
 */
export async function appendHighlight(
  key: string,
  sourcePath: string,
  highlight: Highlight,
  sourceBlobSha: string | null,
): Promise<McpResult<HighlightsSidecar>> {
  return mutate(key, sourcePath, sourceBlobSha, (current) => {
    const next: HighlightsSidecar = current
      ? { ...current, highlights: [...current.highlights, highlight] }
      : {
          version: HIGHLIGHTS_SIDECAR_VERSION,
          source: sourcePath,
          sourceBlobSha,
          highlights: [highlight],
        }
    if (sourceBlobSha !== null) next.sourceBlobSha = sourceBlobSha
    return next
  })
}

/** Remove a highlight by id. No-op (returns current sidecar) if the id
 *  isn't present, which keeps deletes idempotent for retry safety. */
export async function removeHighlight(
  key: string,
  sourcePath: string,
  highlightId: string,
): Promise<McpResult<HighlightsSidecar>> {
  return mutate(key, sourcePath, null, (current) => {
    if (!current) {
      return {
        version: HIGHLIGHTS_SIDECAR_VERSION,
        source: sourcePath,
        sourceBlobSha: null,
        highlights: [],
      }
    }
    return {
      ...current,
      highlights: current.highlights.filter((h) => h.id !== highlightId),
    }
  })
}

// ── internals ───────────────────────────────────────────────────────────

async function mutate(
  key: string,
  sourcePath: string,
  sourceBlobSha: string | null,
  apply: (current: HighlightsSidecar | null) => HighlightsSidecar,
): Promise<McpResult<HighlightsSidecar>> {
  const sidecarPath = sidecarPathFor(sourcePath)

  // 1. Read-for-edit; if missing, write fresh content session-lessly.
  const read = await cloudReadForEdit(key, sidecarPath)
  let current: HighlightsSidecar | null = null
  let exists = false
  if (read.ok) {
    exists = true
    const raw = stripCatN(read.data.file.content ?? "")
    try {
      current = coerceSidecar(JSON.parse(raw), sourcePath)
    } catch {
      // Parsed-failure on existing file is a hard fail — overwriting would
      // destroy whatever's there. Surface as a synthetic error.
      return {
        ok: false,
        isError: true,
        errorCode: 0,
        message: "existing sidecar is not valid JSON; refusing to overwrite",
      }
    }
  } else if (read.errorCode !== ERR_FILE_NOT_FOUND) {
    return read
  }

  const next = apply(current)
  if (sourceBlobSha !== null) next.sourceBlobSha = sourceBlobSha

  const content = `${JSON.stringify(next, null, 2)}\n`
  const write = await cloudWrite(
    key,
    { file_path: sidecarPath, content },
    { useSession: exists },
  )
  if (!write.ok) {
    if (
      !exists &&
      (write.errorCode === ERR_NOT_READ_FIRST ||
        write.errorCode === ERR_MODIFIED_SINCE_READ)
    ) {
      // Race: file appeared between our missing-read and our write. One
      // retry through the full read-then-write path is enough — if a
      // second writer beats us again the user will see the conflict.
      return mutate(key, sourcePath, sourceBlobSha, apply)
    }
    return write
  }
  return { ok: true, data: next, rendered: write.rendered }
}

function coerceSidecar(value: unknown, sourcePath: string): HighlightsSidecar | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.version !== HIGHLIGHTS_SIDECAR_VERSION) return null
  if (!Array.isArray(v.highlights)) return null
  const sourceBlobSha =
    typeof v.sourceBlobSha === "string" || v.sourceBlobSha === null
      ? (v.sourceBlobSha as string | null)
      : null
  return {
    version: HIGHLIGHTS_SIDECAR_VERSION,
    source: typeof v.source === "string" ? v.source : sourcePath,
    sourceBlobSha,
    highlights: v.highlights.filter(isHighlightShape),
  }
}

function isHighlightShape(value: unknown): value is Highlight {
  if (!value || typeof value !== "object") return false
  const h = value as Record<string, unknown>
  return (
    typeof h.id === "string" &&
    typeof h.text === "string" &&
    typeof h.prefix === "string" &&
    typeof h.suffix === "string" &&
    typeof h.color === "string" &&
    typeof h.note === "string" &&
    typeof h.createdAt === "string" &&
    typeof h.locator === "object" &&
    h.locator !== null
  )
}
