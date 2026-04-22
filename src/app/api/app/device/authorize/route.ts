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

  let result: Awaited<ReturnType<typeof cloudAdminDeviceAuthorize>>;
  const deviceLabel = `Device · ${principal.displayLabel}`;
  try {
    result = await cloudAdminDeviceAuthorize({
      user_code: userCode,
      user_id: principal.userId,
      workspace_id: slugToWorkspaceId(ws.slug),
      workspace_slug: ws.slug,
      label: deviceLabel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "authorize_failed", message },
      { status: 502 },
    );
  }

  // Record the connection in Supabase so the StatusSummary + Keys page
  // can show it alongside keys minted via the Connect-Agent UI flow.
  // Best-effort: if this fails the key still works, the row is just
  // cosmetic UX metadata.
  const allowedKinds = new Set([
    "claude-code",
    "cursor",
    "desktop",
    "openclaw",
    "hermes",
    "raw-curl",
    "other",
  ]);
  // Accept `hermes-agent` as an alias for `hermes` (the vendor uses
  // that name on its website).
  const normalizedKind =
    result.agent_kind === "hermes-agent" ? "hermes" : result.agent_kind;
  const agentKind = (
    normalizedKind && allowedKinds.has(normalizedKind)
      ? normalizedKind
      : "other"
  ) as
    | "claude-code"
    | "cursor"
    | "desktop"
    | "openclaw"
    | "hermes"
    | "raw-curl"
    | "other";
  try {
    await identity.insertConnection({
      workspaceId: ws.id,
      keyId: result.key_id,
      label: result.client_name || deviceLabel,
      agentKind,
    });
  } catch {
    /* ignore — not fatal */
  }

  return NextResponse.json({ ok: true });
}
