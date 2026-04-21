/**
 * POST /api/p/:slug/unlock — same-origin proxy to huozi-cloud's unlock
 * endpoint. No auth needed (the passcode is the auth). Exists so the
 * browser's fetch doesn't need to know the cloud worker URL or deal with
 * CORS.
 */

import { NextResponse, type NextRequest } from "next/server";
import { unlockShare } from "@/lib/drive/shares";

interface Body {
  passcode?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const passcode = (body.passcode ?? "").trim();
  if (!/^\d{6}$/.test(passcode)) {
    return NextResponse.json(
      { error: "invalid_passcode" },
      { status: 400 },
    );
  }

  const res = await unlockShare(slug, passcode);
  if (!res.ok) {
    const status =
      res.errorCode === 403
        ? 403
        : res.errorCode === 404
          ? 404
          : 502;
    return NextResponse.json(
      { error: res.message },
      { status },
    );
  }
  return NextResponse.json({ ok: true, ...res.data });
}
