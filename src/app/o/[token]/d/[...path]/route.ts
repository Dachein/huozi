/**
 * Sibling-file data proxy for `/o/<token>` open-token renders.
 *
 * Receives `/o/<token>/d/<path>` and forwards to worker
 * `/o/<token>/data/<path>`. All policy lives in the worker:
 *   - token must verify (HS256, iss huozi-open, unexpired)
 *   - requested path must be listed in the host HTML's
 *     `<meta name="huozi:share-include" content="...">`
 *   - resolved relative to the token's host file directory
 *
 * Open-token sibling of `/p/<slug>/d/<path>` (the public share data
 * proxy). The host HTML uses the same surface-agnostic fetch pattern —
 * `location.pathname.replace(/\/$/, '') + '/d/' + name` or
 * `window.huozi.read(name)` — so the identical file renders data-driven
 * on both the publish (`/p`) and private-preview (`/o`) surfaces.
 */

import type { NextRequest } from "next/server";
import { cloudFetch } from "@/lib/cloud-fetch";

type Params = Promise<{ token: string; path: string[] }>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { token, path } = await params;
  return proxyToWorker(token, path, "GET");
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Params },
): Promise<Response> {
  const { token, path } = await params;
  return proxyToWorker(token, path, "HEAD");
}

async function proxyToWorker(
  token: string,
  pathParts: string[],
  method: "GET" | "HEAD",
): Promise<Response> {
  const dataPath = pathParts.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `/o/${encodeURIComponent(token)}/data/${dataPath}`;

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
