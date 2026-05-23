/**
 * Highlights sidecar API.
 *
 *   GET    /api/app/drive/highlights?path=<source>
 *     → 200 { sidecar: HighlightsSidecar } | 200 { sidecar: null } (no sidecar yet)
 *
 *   POST   /api/app/drive/highlights
 *     body: { source_path, highlight: Highlight, source_blob_sha? }
 *     → 200 { sidecar }   appends one highlight (creates sidecar if needed)
 *
 *   DELETE /api/app/drive/highlights?path=<source>&id=<highlight_id>
 *     → 200 { sidecar }
 *
 * Carve-out pattern mirrors `/api/app/drive/edit`: cookie auth, MCP-side
 * permission enforcement, errorCode → HTTP status mapping kept narrow.
 */

import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client"
import {
  appendHighlight,
  loadSidecar,
  removeHighlight,
} from "@/lib/highlights/sidecar"
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
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 })
  }
  const res = await loadSidecar(key, path)
  if (res.kind === "missing") {
    return NextResponse.json({ sidecar: null })
  }
  if (res.kind === "error") {
    return NextResponse.json(
      { error: "load_failed", code: res.code, message: res.message },
      { status: statusFor(res.code) },
    )
  }
  return NextResponse.json({ sidecar: res.sidecar })
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

  const res = await appendHighlight(key, sourcePath, highlight, sourceBlobSha)
  if (!res.ok) {
    return NextResponse.json(
      { error: "save_failed", code: res.errorCode, message: res.message },
      { status: statusFor(res.errorCode) },
    )
  }
  return NextResponse.json({ sidecar: res.data })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const key = await authKey()
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const path = req.nextUrl.searchParams.get("path")
  const id = req.nextUrl.searchParams.get("id")
  if (!path || !id) {
    return NextResponse.json({ error: "missing_param" }, { status: 400 })
  }
  const res = await removeHighlight(key, path, id)
  if (!res.ok) {
    return NextResponse.json(
      { error: "delete_failed", code: res.errorCode, message: res.message },
      { status: statusFor(res.errorCode) },
    )
  }
  return NextResponse.json({ sidecar: res.data })
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
