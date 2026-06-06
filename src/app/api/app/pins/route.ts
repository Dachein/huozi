/**
 * GET  /api/app/pins              → list the signed-in user's pins
 * POST /api/app/pins  { file_path, pinned }
 *                                       → add (pinned !== false) / remove
 *
 * Thin proxy: reads the huozi-cloud key cookie and forwards to the worker's
 * Bearer-auth `/me/pins` (same per-principal store the miniapp uses, so
 * pins stay in sync across web + mobile). Mirrors the /api/app/project flow.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { cloudFetch } from "@/lib/cloud-fetch";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

async function getKey(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value ?? null;
}

export async function GET(): Promise<NextResponse> {
  const key = await getKey();
  if (!key) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const res = await cloudFetch("/me/pins", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return NextResponse.json(body as Record<string, unknown>, {
    status: res.status,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = await getKey();
  if (!key) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { file_path?: unknown; pinned?: unknown };
  try {
    body = (await req.json()) as { file_path?: unknown; pinned?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.file_path !== "string" || body.file_path.length === 0) {
    return NextResponse.json({ error: "invalid_file_path" }, { status: 400 });
  }

  const res = await cloudFetch("/me/pins", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      file_path: body.file_path,
      pinned: body.pinned !== false,
    }),
  });
  const out = (await res.json().catch(() => ({}))) as unknown;
  return NextResponse.json(out as Record<string, unknown>, {
    status: res.status,
  });
}
