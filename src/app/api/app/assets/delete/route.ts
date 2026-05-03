/**
 * POST /api/app/assets/delete  { path }
 *
 * Deletes a single file under `__assets__/`. Calls the cloud MCP
 * `huozi_rm` tool with the user's session cookie key — same audit /
 * ACL / history path an Agent would use.
 *
 * Architectural note: AGENTS.md frames the Web UI as read-only; writes
 * are supposed to flow only through Agent-driven MCP tool calls. This
 * route is a deliberate, scoped exception:
 *   - hard-coded to paths under `__assets__/` (no general-purpose write
 *     surface — the rest of the workspace stays untouchable from the
 *     browser);
 *   - still goes through the same `huozi_rm` tool, so the Worker's
 *     audit log records the delete just like an Agent-initiated one;
 *   - rationale: `__assets__/` holds hash-named auto-generated PNGs
 *     (ImageRenderTool output, image uploads). Asking an Agent to
 *     delete a one-off test image is high-friction; the lightbox UX
 *     wants a delete affordance.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { HUOZI_CLOUD_KEY_COOKIE, cloudRm } from "@/lib/drive/mcp-client";

const ASSETS_PREFIX = "__assets__/";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { path?: string };
  try {
    body = (await req.json()) as { path?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const path = body.path?.trim();
  if (!path) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }
  // Scope guard — refuse anything outside the assets bucket so this
  // endpoint can't be repurposed as a general workspace-delete back door.
  if (!path.startsWith(ASSETS_PREFIX) || path.includes("..")) {
    return NextResponse.json({ error: "path_out_of_scope" }, { status: 400 });
  }

  const res = await cloudRm(key, path);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.message, code: res.errorCode },
      { status: res.errorCode === 4 ? 404 : 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    deleted_paths: res.data.deleted_paths,
    commit_sha: res.data.commit_sha,
  });
}
