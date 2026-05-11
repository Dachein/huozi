/**
 * Public data proxy for `/p/<slug>` shares — sibling-file fetch path.
 *
 * Receives `/p/<slug>/d/<path>` and forwards to worker
 * `/shares/<slug>/data/<path>`. All policy lives in the worker:
 *   - share must be public + unrevoked
 *   - requested path must be listed in the HTML's
 *     `<meta name="huozi:share-include" content="...">`
 *   - resolved relative to the share file's directory
 *
 * Sibling of `/p/<slug>/a/<path>` (asset proxy for /__assets__/) — that
 * one targets the workspace's shared asset dir; this one targets files
 * the author explicitly named for their HTML to consume.
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
  const dataPath = pathParts.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `/shares/${encodeURIComponent(slug)}/data/${dataPath}`;

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
