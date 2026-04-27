/**
 * POST /api/auth/logout
 *
 * Stateless JWT — clearing the cookie is enough. Worker is not contacted
 * because nothing on its side tracks per-user sessions (TTL handled by
 * JWT exp, sliding window handled by /auth/me).
 */

import { NextResponse } from "next/server";
import { buildLogoutCookie } from "@/lib/auth/jwt";

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", buildLogoutCookie());
  return res;
}
