/**
 * GET /api/app/invites/[token]/accept
 *
 * Logged-in user redeems an invite. The Worker:
 *   1. Verifies invite is pending + emails match.
 *   2. INSERTs a workspace_members row.
 *   3. Marks invite accepted.
 * Then we re-issue the JWT cookie with the new workspace bound, and
 * redirect to /workspace.
 *
 * GET (not POST) so the email link "click → done" path works directly.
 * The redeem itself is idempotent — calling it twice on a single-use
 * token is safe (Worker returns "already_accepted").
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, buildSessionCookie, verifySession } from "@/lib/auth/jwt";
import {
  cloudAdminListWorkspaces,
  cloudAdminRedeemInvite,
} from "@/lib/drive/admin";
import { workerSelectWorkspace } from "@/lib/auth/worker-client";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteCtx,
): Promise<NextResponse> {
  const { token } = await ctx.params;

  const store = await cookies();
  const sessionToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.redirect(
      new URL(
        `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`,
        req.url,
      ),
    );
  }
  const claims = await verifySession(sessionToken);
  if (!claims) {
    return NextResponse.redirect(
      new URL(
        `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`,
        req.url,
      ),
    );
  }

  const redeem = await cloudAdminRedeemInvite({
    token,
    user_id: claims.sub,
  });
  if (!redeem.ok) {
    return NextResponse.redirect(
      new URL(`/invite/${token}?error=${redeem.error}`, req.url),
    );
  }

  // Bind the user's session to the freshly-joined workspace.
  const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}`;
  const reissue = await workerSelectWorkspace({
    cookieHeader,
    workspaceId: redeem.workspace_id,
  });

  // Fetch the workspace's slug so we can encode it in the redirect for the
  // landing toast. Failure here is non-fatal — toast just won't fire.
  const ws = await cloudAdminListWorkspaces({
    id: redeem.workspace_id,
  }).catch(() => []);
  const slug = ws[0]?.slug;
  const target = slug
    ? `/workspace?joined=${encodeURIComponent(slug)}`
    : "/workspace";

  const res = NextResponse.redirect(new URL(target, req.url), {
    status: 303,
  });
  if (reissue.ok) {
    res.headers.set("set-cookie", buildSessionCookie(reissue.token));
  }
  return res;
}
