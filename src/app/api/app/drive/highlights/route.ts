/**
 * Clippings API — backed by workspace-root `clippings.jsonl`.
 *
 *   GET    /api/app/drive/highlights?path=<source_path>
 *     → 200 { clippings: HighlightWithSource[] }
 *     If `path` omitted, returns every clipping in the workspace.
 *
 *   POST   /api/app/drive/highlights
 *     body: { source_path, source_blob_sha?, highlight: Highlight }
 *     → 200 { clippings: HighlightWithSource[] }
 *     Appends a `create` event to clippings.jsonl.
 *
 *   DELETE /api/app/drive/highlights?id=<highlight_id>
 *     → 200 { clippings: HighlightWithSource[] }
 *     Appends a `remove` event (tombstone — history preserved).
 *
 * Auth: cookie carve-out, same pattern as `/api/app/drive/edit`.
 * Pre-clippings.jsonl sidecars (`<path>.highlights.json`) are no longer
 * read or written by any of these routes.
 */

import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client"
import {
  createClipping,
  loadClippings,
  removeClipping,
} from "@/lib/highlights/clippings"
import type { Highlight } from "@/lib/highlights/types"

const MAX_TEXT_BYTES = 8_000
const MAX_AFFIX_BYTES = 200

function statusFor(code: number): number {
  switch (code) {
    case 4:
      return 404
    case 6:
    case 7:
    case 8:
    case 9:
      return 409
    case 101:
    case 102:
      return 403
    case 110:
      return 400
    case 401:
      return 401
    case 403:
      return 403
    default:
      return 502
  }
}

async function authKey(): Promise<string | null> {
  const c = await cookies()
  return c.get(HUOZI_CLOUD_KEY_COOKIE)?.value ?? null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = await authKey()
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const path = req.nextUrl.searchParams.get("path")
  const res = await loadClippings(
    key,
    path ? { sourcePath: path } : {},
  )
  if (res.kind === "error") {
    return NextResponse.json(
      { error: "load_failed", code: res.code, message: res.message },
      { status: statusFor(res.code) },
    )
  }
  return NextResponse.json({ clippings: res.clippings })
}

interface PostBody {
  source_path?: unknown
  source_blob_sha?: unknown
  highlight?: unknown
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = await authKey()
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const sourcePath = body.source_path
  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    return NextResponse.json({ error: "invalid_source_path" }, { status: 400 })
  }
  const highlight = validateHighlight(body.highlight)
  if (!highlight) {
    return NextResponse.json({ error: "invalid_highlight" }, { status: 400 })
  }
  const sourceBlobSha =
    typeof body.source_blob_sha === "string" && body.source_blob_sha.length > 0
      ? body.source_blob_sha
      : null

  const res = await createClipping(
    key,
    highlight,
    sourcePath,
    sourceBlobSha,
    "user",
  )
  if (!res.ok) {
    return NextResponse.json(
      { error: "save_failed", code: res.errorCode, message: res.message },
      { status: statusFor(res.errorCode) },
    )
  }
  return NextResponse.json({ clippings: res.data })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const key = await authKey()
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 })
  }
  const res = await removeClipping(key, id, "user")
  if (!res.ok) {
    return NextResponse.json(
      { error: "delete_failed", code: res.errorCode, message: res.message },
      { status: statusFor(res.errorCode) },
    )
  }
  return NextResponse.json({ clippings: res.data })
}

function validateHighlight(value: unknown): Highlight | null {
  if (!value || typeof value !== "object") return null
  const h = value as Record<string, unknown>
  if (typeof h.id !== "string" || h.id.length === 0 || h.id.length > 64) {
    return null
  }
  if (typeof h.text !== "string" || h.text.length > MAX_TEXT_BYTES) return null
  if (typeof h.prefix !== "string" || h.prefix.length > MAX_AFFIX_BYTES) {
    return null
  }
  if (typeof h.suffix !== "string" || h.suffix.length > MAX_AFFIX_BYTES) {
    return null
  }
  if (typeof h.color !== "string" || h.color.length > 32) return null
  if (typeof h.note !== "string" || h.note.length > MAX_TEXT_BYTES) return null
  if (typeof h.createdAt !== "string") return null
  const locator = validateLocator(h.locator)
  if (!locator) return null
  return {
    id: h.id,
    text: h.text,
    prefix: h.prefix,
    suffix: h.suffix,
    color: h.color,
    note: h.note,
    createdAt: h.createdAt,
    locator,
  }
}

function validateLocator(value: unknown): Highlight["locator"] | null {
  if (!value || typeof value !== "object") return null
  const l = value as Record<string, unknown>
  if (l.kind === "bytes") {
    if (typeof l.start !== "number" || typeof l.end !== "number") return null
    if (!Number.isFinite(l.start) || !Number.isFinite(l.end)) return null
    if (l.end <= l.start) return null
    return { kind: "bytes", start: l.start, end: l.end }
  }
  if (l.kind === "jsonl-field") {
    if (
      typeof l.lineNumber !== "number" ||
      typeof l.lineText !== "string" ||
      typeof l.fieldKey !== "string" ||
      typeof l.lineRaw !== "object" ||
      l.lineRaw === null
    ) {
      return null
    }
    return {
      kind: "jsonl-field",
      lineNumber: l.lineNumber,
      lineText: l.lineText,
      lineRaw: l.lineRaw as Record<string, unknown>,
      fieldKey: l.fieldKey,
    }
  }
  return null
}
