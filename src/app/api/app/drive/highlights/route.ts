/**
 * Clippings API — backed by per-user `.huozi/clippings/<userId>/clippings.jsonl`.
 *
 *   GET    /api/app/drive/highlights?path=<source_path>
 *     → 200 { clippings: HighlightWithSource[] }
 *     If `path` omitted, returns every clipping the caller owns.
 *
 *   POST   /api/app/drive/highlights
 *     body: { source_path, source_blob_sha?, highlight: Highlight }
 *     → 200 { clippings: HighlightWithSource[] }
 *
 *   DELETE /api/app/drive/highlights?id=<highlight_id>
 *     → 200 { clippings: HighlightWithSource[] }
 *
 * Auth model
 * - Identity comes from getIdentity() (JWT cookie in Cloud, single
 *   admin principal in Edge). The MCP key cookie authenticates the
 *   actual file read/write against the cloud worker; both cookies are
 *   required.
 * - The clippings file path is computed *server-side* from the
 *   resolved userId; clients cannot ask for someone else's clippings
 *   via the path query param. Within the workspace, only the owner
 *   can read their own clippings — enforced by folder-acl
 *   (mode: "private", members: [userId]) installed on the first write
 *   and re-asserted on every subsequent write for resilience.
 *
 * Pre-per-user `clippings.jsonl` files at workspace root are orphans
 * now and not surfaced by this route. They can be deleted via the
 * normal file operations.
 */

import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client"
import { getIdentity } from "@/lib/identity"
import { slugToWorkspaceId } from "@/lib/drive/admin"
import {
  createClipping,
  loadClippings,
  removeClipping,
} from "@/lib/highlights/clippings"
import { ensureClippingsAcl } from "@/lib/highlights/acl"
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

/**
 * Resolve {mcpKey, userId, workspaceId} for the current request, or
 * return a NextResponse with an appropriate auth error. All three
 * routes share this shape — the MCP key is needed for file IO, the
 * userId/workspaceId pair drives the per-user path + ACL.
 */
interface AuthedContext {
  key: string
  userId: string
  workspaceId: string
}

async function authorize(): Promise<NextResponse | AuthedContext> {
  const c = await cookies()
  const key = c.get(HUOZI_CLOUD_KEY_COOKIE)?.value
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const identity = await getIdentity()
  const principal = await identity.getPrincipal()
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const ws = await identity.getPrimaryWorkspace()
  if (!ws) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 })
  }
  return {
    key,
    userId: principal.userId,
    workspaceId: slugToWorkspaceId(ws.slug),
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authorize()
  if (ctx instanceof NextResponse) return ctx
  const path = req.nextUrl.searchParams.get("path")
  const res = await loadClippings(
    ctx.key,
    ctx.userId,
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
  const ctx = await authorize()
  if (ctx instanceof NextResponse) return ctx
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

  // Idempotently lock the user's clippings folder before writing. If
  // this fails we refuse the write rather than create an unprotected
  // file — better to surface the ACL failure than silently leak the
  // user's clippings to workspace peers.
  const aclRes = await ensureClippingsAcl(ctx.workspaceId, ctx.userId)
  if (!aclRes.ok) {
    return NextResponse.json(
      { error: "acl_setup_failed", message: aclRes.message },
      { status: 502 },
    )
  }

  const res = await createClipping(
    ctx.key,
    ctx.userId,
    highlight,
    sourcePath,
    sourceBlobSha,
    ctx.userId,
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
  const ctx = await authorize()
  if (ctx instanceof NextResponse) return ctx
  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 })
  }
  const res = await removeClipping(ctx.key, ctx.userId, id, ctx.userId)
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
