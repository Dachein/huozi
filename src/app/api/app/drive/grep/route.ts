/**
 * POST /api/app/drive/grep
 *
 * Workspace search endpoint. Fans out two `huozi_grep` calls (count + content)
 * and returns aggregated `{ path, total, snippets[] }` so the UI can render
 * snippets with the matched literal highlighted, plus a "共 N 处" footer.
 *
 * Permissions are enforced entirely by the Worker:
 *   1. API key auth (cookie) → workspaceId + principalId + scopePath
 *   2. Capability check       → `huozi_grep` requires `read`
 *   3. Scope rewrite          → no `path` arg = bounded to scopePath
 *   4. Folder ACL input check → 403 if path is in private folder
 *   5. Folder ACL output filter → strips ACL'd files from filenames + content
 *
 * This route adds NO permission logic of its own.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cloudGrep, HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

interface GrepBody {
  pattern?: string;
  path?: string;
  glob?: string;
}

// File-count cap. Bounds the largest "files matched" panel and the count call.
const MAX_FILES = 30;
// Match-line budget for the content call. At 3 snippets per file × 30 files
// that's 90 lines best case; budget extra so files-with-many-matches don't
// starve later files entirely.
const CONTENT_BUDGET = 200;
const SNIPPETS_PER_FILE = 3;
const MAX_PATTERN_BYTES = 256;

interface Snippet {
  line: number;
  text: string;
}
interface Hit {
  path: string;
  total: number;
  snippets: Snippet[];
}

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

  const baseOpts = {
    "-i": true as const,
    ...(body.path ? { path: body.path } : {}),
    ...(body.glob ? { glob: body.glob } : {}),
  };

  const [countRes, contentRes] = await Promise.all([
    cloudGrep(key, pattern, {
      ...baseOpts,
      output_mode: "count",
      head_limit: MAX_FILES,
    }),
    cloudGrep(key, pattern, {
      ...baseOpts,
      output_mode: "content",
      head_limit: CONTENT_BUDGET,
    }),
  ]);

  if (!countRes.ok) {
    const status =
      countRes.errorCode === 401 ? 401 : countRes.errorCode === 403 ? 403 : 502;
    return NextResponse.json(
      {
        error: "grep_failed",
        message: countRes.message,
        code: countRes.errorCode,
      },
      { status },
    );
  }

  // Parse counts: each line "path:N". The path may itself contain ':' so we
  // split on the LAST ':' (the count is always trailing digits).
  const counts = new Map<string, number>();
  const countText = countRes.data.content ?? "";
  for (const line of countText.split("\n")) {
    if (!line) continue;
    const idx = line.lastIndexOf(":");
    if (idx <= 0) continue;
    const path = line.slice(0, idx);
    const n = Number.parseInt(line.slice(idx + 1), 10);
    if (Number.isFinite(n) && path) counts.set(path, n);
  }

  // Parse content: each match line is `path:lineno:text`. Anchor parsing on
  // the known paths from the count call (longest-prefix wins, so a path that
  // happens to be a prefix of another doesn't shadow it).
  const knownPaths = [...counts.keys()].sort((a, b) => b.length - a.length);
  const snippetsByPath = new Map<string, Snippet[]>();
  if (contentRes.ok) {
    const contentText = contentRes.data.content ?? "";
    for (const line of contentText.split("\n")) {
      if (!line) continue;
      const matchedPath = knownPaths.find(
        (p) => line.length > p.length && line[p.length] === ":" && line.startsWith(p),
      );
      if (!matchedPath) continue;
      const rest = line.slice(matchedPath.length + 1);
      const lnoEnd = rest.indexOf(":");
      if (lnoEnd === -1) continue;
      const lineno = Number.parseInt(rest.slice(0, lnoEnd), 10);
      if (!Number.isFinite(lineno)) continue;
      const text = rest.slice(lnoEnd + 1);
      const arr = snippetsByPath.get(matchedPath) ?? [];
      if (arr.length < SNIPPETS_PER_FILE) {
        arr.push({ line: lineno, text });
        snippetsByPath.set(matchedPath, arr);
      }
    }
  }

  const hits: Hit[] = [...counts.entries()]
    .map(([path, total]) => ({
      path,
      total,
      snippets: snippetsByPath.get(path) ?? [],
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.path.localeCompare(b.path);
    });

  return NextResponse.json({
    ok: true,
    hits,
    truncated: countRes.data.appliedLimit !== undefined,
  });
}
