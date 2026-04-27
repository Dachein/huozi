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
import { isEdge } from "@/lib/edition";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(HUOZI_CLOUD_KEY_COOKIE);
  cookieStore.delete(SESSION_COOKIE_NAME);

  // Edge admin lands back on the paste-key page. Cloud users go home.
  return NextResponse.redirect(
    new URL(isEdge() ? "/connect" : "/", req.url),
    { status: 303 },
  );
}
