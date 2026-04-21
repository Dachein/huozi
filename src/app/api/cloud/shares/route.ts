/**
 * POST /api/cloud/shares — create a share for a path in the caller's
 * workspace. Reads the HttpOnly API-key cookie, forwards to huozi-cloud's
 * /shares endpoint.
 *
 * Body: { file_path: string; passcode?: string }
 * Returns: { ok: true, slug, file_path, has_passcode, ... }
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createShare } from "@/lib/drive/shares";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

interface Body {
  file_path?: string;
  passcode?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const filePath = (body.file_path ?? "").trim();
  if (!filePath) {
    return NextResponse.json({ error: "missing_file_path" }, { status: 400 });
  }
  const passcode = (body.passcode ?? "").trim();
  if (passcode && !/^\d{6}$/.test(passcode)) {
    return NextResponse.json(
      { error: "invalid_passcode" },
      { status: 400 },
    );
  }

  const res = await createShare(key, {
    file_path: filePath,
    ...(passcode ? { passcode } : {}),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "create_failed", message: res.message },
      { status: 502 },
    );
  }
  return NextResponse.json(res);
}
