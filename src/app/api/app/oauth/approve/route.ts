/**
 * POST /api/app/oauth/approve
 *
 * Body: { session_id, workspace_id }
 *
 * Called by the /authorize consent page after the user clicks "Authorize".
 * Re-validates the user's session, then asks the worker to mint an
 * authorization code and produce the redirect URL back to the agent.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { oauthApprove } from "@/lib/drive/oauth-admin";

interface Body {
  session_id?: string;
  workspace_id?: string;
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
  const sessionId = (body.session_id ?? "").trim();
  const workspaceId = (body.workspace_id ?? "").trim();
  if (!sessionId || !workspaceId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!workspaceId.startsWith("ws_")) {
    return NextResponse.json(
      { error: "invalid_workspace_id" },
      { status: 400 },
    );
  }

  // Cross-check: the workspace_id passed from the client must be one this
  // user is actually a member of. Otherwise an authenticated user could
  // approve an OAuth grant against a workspace they have no relation to.
  const workspace = await identity.getPrimaryWorkspace();
  if (!workspace || `ws_${workspace.slug}` !== workspaceId) {
    return NextResponse.json(
      { error: "workspace_not_member" },
      { status: 403 },
    );
  }

  const result = await oauthApprove({
    session_id: sessionId,
    user_id: principal.userId,
    workspace_id: workspaceId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, redirect_url: result.redirect_url });
}
