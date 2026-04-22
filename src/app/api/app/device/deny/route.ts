/**
 * POST /api/app/device/deny — mark a device grant as denied.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminDeviceDeny } from "@/lib/drive/admin";

interface Body {
  user_code?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userCode = (body.user_code ?? "").trim().toUpperCase();
  if (!userCode) {
    return NextResponse.json({ error: "missing_user_code" }, { status: 400 });
  }

  try {
    await cloudAdminDeviceDeny(userCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "deny_failed", message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
