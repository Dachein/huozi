/**
 * Private asset proxy for `/o/<token>` open-token renders.
 *
 * Receives `/o/<token>/a/<path>` and forwards to worker
 * `/o/<token>/asset/__assets__/<path>`. The worker verifies the short-lived
 * open token and only serves files under `__assets__/` from the same
 * workspace as the token-bound host file.
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
  const assetPath = pathParts.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `/o/${encodeURIComponent(token)}/asset/__assets__/${assetPath}`;

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
