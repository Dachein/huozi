/**
 * DELETE /api/app/shares/[slug] — revoke a share owned by the caller.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { revokeShare } from "@/lib/drive/shares";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  const res = await revokeShare(key, slug);
  if (!res.ok) {
    return NextResponse.json(
      { error: "revoke_failed", message: res.message },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, slug });
}
