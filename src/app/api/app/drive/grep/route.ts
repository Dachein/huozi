/**
 * POST /api/app/drive/grep
 *
 * Workspace search endpoint — thin wrapper around `huozi_grep`'s
 * `files_with_matches` mode. Returns the workspace-relative paths that
 * contain the literal query.
 *
 * Why files_with_matches and not content/count: those modes hit a
 * pre-existing Worker ACL output-filter quirk where the allowlist is
 * derived from `data.filenames` — which is empty in count/content modes —
 * so non-system principals get stripped to nothing. files_with_matches
 * populates filenames[] and routes through the ACL filter cleanly, which
 * is all the workspace search box needs.
 *
 * Permissions are enforced entirely by the Worker:
 *   1. API key auth (cookie) → workspaceId + principalId + scopePath
 *   2. Capability check       → `huozi_grep` requires `read`
 *   3. Scope rewrite          → no `path` arg = bounded to scopePath
 *   4. Folder ACL input check → 403 if path is in private folder
 *   5. Folder ACL output filter → strips ACL'd files from filenames
 */

import { NextResponse, type NextRequest } from "next/server";
import { cloudGrep, HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

interface GrepBody {
  pattern?: string;
  path?: string;
  glob?: string;
}

const MAX_FILES = 30;
const MAX_PATTERN_BYTES = 256;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = req.cookies.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: GrepBody;
  try {
    body = (await req.json()) as GrepBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pattern = (body.pattern ?? "").trim();
  if (!pattern) {
    return NextResponse.json({ error: "missing_pattern" }, { status: 400 });
  }
  if (pattern.length > MAX_PATTERN_BYTES) {
    return NextResponse.json({ error: "pattern_too_long" }, { status: 400 });
  }

  const res = await cloudGrep(key, pattern, {
    output_mode: "files_with_matches",
    "-i": true,
    head_limit: MAX_FILES,
    ...(body.path ? { path: body.path } : {}),
    ...(body.glob ? { glob: body.glob } : {}),
  });
  if (!res.ok) {
    const status =
      res.errorCode === 401 ? 401 : res.errorCode === 403 ? 403 : 502;
    return NextResponse.json(
      { error: "grep_failed", message: res.message, code: res.errorCode },
      { status },
    );
  }
  return NextResponse.json({
    ok: true,
    filenames: res.data.filenames,
    truncated: res.data.appliedLimit !== undefined,
  });
}
