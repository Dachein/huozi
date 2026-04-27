/**
 * POST /api/auth/otp/verify
 *
 * Browser → Next.js (here) → Worker /auth/otp/verify.
 * On success the Worker mints a JWT; we set it as an HttpOnly cookie on
 * the huozi.app domain (the cookie the Worker itself returns is bound to
 * cloud.huozi.app and is unused — we re-use the token to set our own).
 */

import { NextResponse, type NextRequest } from "next/server";
import { workerOtpVerify } from "@/lib/auth/worker-client";
import { buildSessionCookie } from "@/lib/auth/jwt";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: string; code?: string };
  try {
    body = (await req.json()) as { email?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await workerOtpVerify(email, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Decide where the browser should land next based on workspace count.
  let redirect: string;
  if (result.wsid) {
    redirect = "/workspace";
  } else if (result.workspaces.length === 0) {
    redirect = "/onboard";
  } else {
    redirect = "/select-workspace";
  }

  const res = NextResponse.json({
    ok: true,
    user: result.user,
    workspaces: result.workspaces,
    wsid: result.wsid,
    redirect,
  });
  res.headers.set("set-cookie", buildSessionCookie(result.token));
  return res;
}
