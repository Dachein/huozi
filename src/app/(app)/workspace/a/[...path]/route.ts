/**
 * Authenticated asset proxy for `/workspace/view`.
 *
 * Receives `/workspace/a/<path>` and forwards to worker
 * `/me/asset/__assets__/<path>` with the user's api_key as Bearer auth.
 * The worker keeps the `__assets__/` workspace prefix; this route puts
 * the prefix back on the way out.
 *
 * Mirror of `src/app/p/[slug]/a/[...path]/route.ts` — same shape, but
 * cookie-auth + workspace-scoped instead of public + share-slug-scoped.
 * URL convention rationale: `packages/huozi-cloud/SPEC.md` §4.8.
 */

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { cloudFetch } from "@/lib/cloud-fetch";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

type Params = Promise<{ path: string[] }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { path } = await params;
  return proxyToWorker(path, "GET");
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { path } = await params;
  return proxyToWorker(path, "HEAD");
}

async function proxyToWorker(
  pathParts: string[],
  method: "GET" | "HEAD",
): Promise<Response> {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // pathParts = segments AFTER /workspace/a/. Worker expects
  // `__assets__/<path>` — put the prefix back here.
  const assetPath = pathParts.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `/me/asset/__assets__/${assetPath}`;

  let res: Response;
  try {
    res = await cloudFetch(upstream, {
      method,
      headers: { Authorization: `Bearer ${key}` },
    });
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
  // Curated allow-list keeps the proxy boundary tight (no Set-Cookie etc).
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
