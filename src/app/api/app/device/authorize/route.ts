/**
 * POST /api/app/device/authorize
 *
 * Body: { user_code, workspace_id }
 *
 * Gated by Supabase session (via identity). Calls the Worker's
 * admin-auth'd /admin/device-authorize, which mints a workspace-scoped
 * api_key and writes it onto the device grant. The Agent's next poll
 * against /auth/token picks it up.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminDeviceAuthorize, slugToWorkspaceId } from "@/lib/drive/admin";

interface Body {
  user_code?: string;
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
  const userCode = (body.user_code ?? "").trim().toUpperCase();
  if (!userCode) {
    return NextResponse.json({ error: "missing_user_code" }, { status: 400 });
  }

  // Resolve the workspace — for v1 we always target the user's primary
  // workspace (request body's workspace_id is validated against it to
  // catch tampering).
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }
  const requestedId = (body.workspace_id ?? "").trim();
  if (requestedId && requestedId !== ws.id) {
    return NextResponse.json(
      { error: "workspace_mismatch" },
      { status: 403 },
    );
  }

  try {
    await cloudAdminDeviceAuthorize({
      user_code: userCode,
      user_id: principal.userId,
      workspace_id: slugToWorkspaceId(ws.slug),
      workspace_slug: ws.slug,
      label: `Device · ${principal.displayLabel}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "authorize_failed", message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
