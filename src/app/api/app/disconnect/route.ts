/**
 * POST /api/app/disconnect — sign the user out.
 *
 * Clears the workspace cookie (HUOZI_CLOUD_KEY_COOKIE used by Edge for the
 * pasted API key) and the JWT session cookie. Stateless JWT means there's
 * no server-side session to revoke — the cookie is gone, the next request
 * authenticates as anonymous.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(HUOZI_CLOUD_KEY_COOKIE);
  cookieStore.delete(SESSION_COOKIE_NAME);

  // Both editions land on `/` of whichever host they signed out from —
  // huozi.app, edge.huozi.app, or any custom self-host domain. The
  // marketing build serves that path on the hosted site; self-host
  // deployers map their custom domain root to this product build, in
  // which case `/` falls through src/app/page.tsx → /workspace → /login.
  // Either way, no dead-end /connect (removed mid-2026) and no edition
  // branching here.
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
