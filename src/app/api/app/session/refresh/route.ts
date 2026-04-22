/**
 * GET /api/app/session/refresh — re-issue a browser-session cookie.
 *
 * Lands here when a signed-in user has lost (or never had) the
 * workspace cookie — e.g. after an explicit Exit that also cleared
 * Supabase, then signing back in via the device-flow page. The (app)
 * layout has already verified principal + workspace; this route just
 * mints a fresh workspace-scoped key, records it as a connection, and
 * writes the cookie before bouncing the user back to their destination.
 *
 * Query params:
 *   - `?next=<path>` — where to redirect after minting (default
 *     `/workspace`). The value is validated (must be internal) so we
 *     can't be used as an open-redirect.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminMintKey, slugToWorkspaceId } from "@/lib/drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";

function safeNext(raw: string | null): string {
  const fallback = "/workspace";
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(next)}`, req.url),
      { status: 303 },
    );
  }
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.redirect(new URL("/onboard", req.url), { status: 303 });
  }

  // Mint a fresh browser-session key. If minting fails (upstream
  // error), degrade gracefully to the paste-key fallback.
  let apiKey: string;
  let keyId: string;
  try {
    const minted = await cloudAdminMintKey({
      workspace_id: slugToWorkspaceId(ws.slug),
      principal_id: principal.userId,
      principal_type: "user",
      name: identity.formatMintName(
        `${ws.name} · browser session`,
        "other",
      ),
    });
    apiKey = minted.api_key;
    keyId = minted.key_id;
  } catch {
    return NextResponse.redirect(new URL("/connect", req.url), {
      status: 303,
    });
  }

  // Record the connection for the Keys page listing. If this fails we
  // still proceed — the key is already minted and functional; the
  // metadata row is a convenience, not a correctness requirement.
  try {
    await identity.insertConnection({
      workspaceId: ws.id,
      keyId,
      label: "Browser session",
      agentKind: "other",
    });
  } catch {
    /* ignore */
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  const cookieStore = await cookies();
  cookieStore.set({
    name: HUOZI_CLOUD_KEY_COOKIE,
    value: apiKey,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
