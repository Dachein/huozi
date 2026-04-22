/**
 * POST /api/app/disconnect — sign the user out.
 *
 * Cloud edition: full sign-out — clear the workspace cookie AND the
 * Supabase session, then land on `/`. The principal is truly gone.
 *
 * Edge edition: no Supabase to sign out of; clearing the cookie is the
 * whole thing. Land on `/connect` so the admin can paste another key
 * (or just close the tab).
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { isEdge } from "@/lib/edition";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(HUOZI_CLOUD_KEY_COOKIE);

  if (isEdge()) {
    return NextResponse.redirect(new URL("/connect", req.url), {
      status: 303,
    });
  }

  // Cloud: also end the Supabase session. We lazy-load the server client
  // so Edge builds stay free of Supabase imports. Failures are non-fatal
  // — we still want to clear the cookie + redirect.
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    /* best-effort */
  }

  return NextResponse.redirect(new URL("/", req.url), {
    status: 303,
  });
}
