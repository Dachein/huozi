/**
 * Authenticated sibling-data proxy for workspace dashboard preview.
 *
 * Receives `/workspace/d/<encoded-host-file>/<sibling-path>`. The host
 * path identifies the dashboard HTML being rendered; the sibling is
 * resolved relative to its directory and gated by the HOST's
 * `<meta huozi:share-include>` allowlist — same contract the worker
 * enforces on publish (`/p/<slug>/d/<sibling>`). Symmetric in spirit:
 * different auth surface (cookie vs share), same allowlist semantics,
 * same author code on both surfaces.
 *
 * Why check the allowlist here when the user technically has read
 * access to their own workspace? It catches missing
 * `huozi:share-include` declarations during workspace preview, instead
 * of after a share goes out and breaks for anonymous viewers. The
 * proxy fails identically on both surfaces, so authors discover the
 * bug while still editing.
 *
 * Mirror of `app/src/app/p/[slug]/d/[...path]/route.ts` — same shape,
 * different auth + different upstream call.
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  cloudRead,
  stripCatN,
  HUOZI_CLOUD_KEY_COOKIE,
} from "@/lib/drive/mcp-client";

type Params = Promise<{ host: string; sibling: string[] }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { host, sibling } = await params;
  return serve(host, sibling);
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { host, sibling } = await params;
  return serve(host, sibling, /*headOnly*/ true);
}

const jsonError = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function serve(
  encodedHost: string,
  siblingParts: string[],
  headOnly = false,
): Promise<Response> {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) return jsonError(401, { error: "unauthenticated" });

  // The host file path was `encodeURIComponent`'d into a single segment
  // by file-renderer.tsx, so its slashes survived as `%2F`. Decode it
  // back to a workspace-relative path.
  let hostFile: string;
  try {
    hostFile = decodeURIComponent(encodedHost);
  } catch {
    return jsonError(400, { error: "bad_host_encoding" });
  }
  if (!hostFile || hostFile.includes("..")) {
    return jsonError(400, { error: "bad_host_path" });
  }

  const siblingPath = siblingParts.join("/");
  if (!siblingPath || siblingPath.includes("..")) {
    return jsonError(400, { error: "bad_sibling_path" });
  }

  // Read the host HTML so we can parse its share-include allowlist.
  // Without this we can't verify the sibling was declared.
  const hostRead = await cloudRead(key, hostFile);
  if (!hostRead.ok) {
    return jsonError(hostRead.errorCode || 404, {
      error: "host_read_failed",
      message: hostRead.message,
    });
  }
  if (hostRead.data.type !== "text" || !hostRead.data.file.content) {
    return jsonError(400, { error: "host_not_text" });
  }

  const hostHtml = stripCatN(hostRead.data.file.content);
  const allowlist = parseShareInclude(hostHtml);
  if (!allowlist.includes(siblingPath)) {
    return jsonError(403, {
      error: "not_in_share_include",
      message: `'${siblingPath}' not listed in <meta huozi:share-include> of ${hostFile}`,
      declared: allowlist,
    });
  }

  // Resolve sibling relative to the host file's directory. Mirrors the
  // worker's relative-resolution logic for /shares/<slug>/data/<path>.
  const hostDir = hostFile.includes("/")
    ? hostFile.slice(0, hostFile.lastIndexOf("/") + 1)
    : "";
  const resolved = hostDir + siblingPath;

  const siblingRead = await cloudRead(key, resolved);
  if (!siblingRead.ok) {
    return jsonError(siblingRead.errorCode || 404, {
      error: "sibling_read_failed",
      message: siblingRead.message,
    });
  }
  if (siblingRead.data.type !== "text") {
    return jsonError(415, {
      error: "non_text_sibling",
      message: "binary siblings via /workspace/d/ are not supported",
    });
  }

  const body = stripCatN(siblingRead.data.file.content ?? "");
  const mime =
    siblingRead.data.file.mimeType ??
    guessMime(resolved) ??
    "text/plain; charset=utf-8";

  return new Response(headOnly ? null : body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Parse `<meta name="huozi:share-include" content="a.jsonl, sub/b.csv">`.
 *  Returns empty list when absent. Tolerates whitespace and trailing
 *  commas. Order is preserved (callers use exact-membership only). */
function parseShareInclude(html: string): string[] {
  const m = html.match(
    /<meta\s+[^>]*?\bname\s*=\s*["']huozi:share-include["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']/i,
  );
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Minimal MIME guess for the common dashboard sibling types. Falls
 *  through to text/plain on miss; the proxy isn't a generic content
 *  server, so we don't ship a full mime map. */
function guessMime(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "jsonl":
    case "ndjson":
      return "application/x-ndjson; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "tsv":
      return "text/tab-separated-values; charset=utf-8";
    case "txt":
    case "md":
    case "html":
    case "htm":
      return "text/plain; charset=utf-8";
    default:
      return null;
  }
}
