/**
 * POST /api/app/shares — create a share for a path in the caller's
 * workspace. Reads the HttpOnly API-key cookie, forwards to huozi-cloud's
 * /shares endpoint.
 *
 * Body: { file_path: string; slug?: string; passcode?: string }
 * Returns: { ok: true, slug, file_path, has_passcode, ... }
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createShare } from "@/lib/drive/shares";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

interface Body {
  file_path?: string;
  slug?: string;
  passcode?: string;
  expires_in_seconds?: number | null;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

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
  const slug = (body.slug ?? "").trim().toLowerCase();
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json(
      {
        error: "invalid_slug",
        message:
          "Slug must be 3–40 lowercase letters/digits, with hyphens allowed in the middle.",
      },
      { status: 400 },
    );
  }

  // Validate optional TTL. undefined / null / 0 means never expires.
  let expiresIn: number | null = null;
  if (body.expires_in_seconds !== undefined && body.expires_in_seconds !== null) {
    const n = body.expires_in_seconds;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_TTL_SECONDS) {
      return NextResponse.json(
        {
          error: "invalid_ttl",
          message: `expires_in_seconds must be a non-negative number ≤ ${MAX_TTL_SECONDS}.`,
        },
        { status: 400 },
      );
    }
    expiresIn = n > 0 ? Math.floor(n) : null;
  }

  const res = await createShare(key, {
    file_path: filePath,
    ...(slug ? { slug } : {}),
    ...(passcode ? { passcode } : {}),
    ...(expiresIn !== null ? { expires_in_seconds: expiresIn } : {}),
  });
  if (!res.ok) {
    // Map Worker errors to useful HTTP statuses so the UI can react.
    const status =
      res.error === "slug_taken"
        ? 409
        : res.error === "invalid_slug" ||
            res.error === "invalid_passcode" ||
            res.error === "invalid_ttl"
          ? 400
          : res.error === "file_not_found"
            ? 404
            : res.status || 502;
    return NextResponse.json(
      { error: res.error ?? "create_failed", message: res.message },
      { status },
    );
  }
  return NextResponse.json(res);
}
