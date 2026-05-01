/**
 * Public asset proxy for /p/<slug> shares.
 *
 * Markdown rendered by `/p/[slug]/page.tsx` may contain image
 * references that originally pointed at workspace-relative paths like
 * `/__assets__/foo.png`. The renderer rewrites those to
 * `/p/<slug>/a/foo.png` (see lib/markdown/renderer.ts) — `/a/` instead
 * of `/__assets__/` because Next.js treats `_`-prefixed folders as
 * private (not routed). This route resolves them by proxying to
 * `cloud.huozi.app/shares/<slug>/asset/__assets__/foo.png` (worker
 * side keeps the original `__assets__/` workspace path).
 *
 * The worker side is responsible for:
 *   - Validating the share is public (no passcode) and not revoked
 *   - Looking up the asset in the share's workspace
 *   - Streaming bytes with the right Content-Type + cache headers
 *
 * We do nothing here besides forwarding — kept thin so the cache /
 * security policy stays in one place (the worker).
 */

import type { NextRequest } from "next/server";
import { cloudFetch } from "@/lib/cloud-fetch";

type Params = Promise<{ slug: string; path: string[] }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { slug, path } = await params;
  return proxyToWorker(slug, path, "GET");
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { slug, path } = await params;
  return proxyToWorker(slug, path, "HEAD");
}

async function proxyToWorker(
  slug: string,
  pathParts: string[],
  method: "GET" | "HEAD",
): Promise<Response> {
  // pathParts is the segments AFTER /p/<slug>/a/ — the public URL
  // shape, with __assets__ stripped (Next routing constraint, see
  // file header). Put it back when constructing the worker URL.
  const assetPath = pathParts
    .map((p) => encodeURIComponent(p))
    .join("/");
  const upstream = `/shares/${encodeURIComponent(slug)}/asset/__assets__/${assetPath}`;

  let res: Response;
  try {
    res = await cloudFetch(upstream, { method });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "upstream_fetch_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Pass through bytes + content-type + cache headers from the worker.
  // Strip cookies / auth-y response headers via a curated allow-list to
  // keep the proxy boundary tight.
  const headers = new Headers();
  const passThrough = [
    "Content-Type",
    "Content-Length",
    "Cache-Control",
    "ETag",
    "X-Content-Type-Options",
  ];
  for (const h of passThrough) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
}
