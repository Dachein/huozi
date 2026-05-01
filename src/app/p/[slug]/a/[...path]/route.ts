/**
 * Public asset proxy for `/p/<slug>` shares.
 *
 * Receives `/p/<slug>/a/<path>` and forwards to worker
 * `/shares/<slug>/asset/__assets__/<path>` (worker keeps the
 * `__assets__/` workspace prefix). All policy — public-share check,
 * caching, content-type — lives in the worker; this route is just a
 * thin tunnel.
 *
 * URL shape rationale + canonical 4-layer table: see
 * `packages/huozi-cloud/SPEC.md` §4.8 "URL 约定".
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
  // pathParts = segments AFTER /p/<slug>/a/. Worker expects
  // `__assets__/<path>` — put the prefix back here.
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
