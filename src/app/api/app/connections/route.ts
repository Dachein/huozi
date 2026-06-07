/**
 * GET /api/app/connections
 *
 * Lists the API-key connections (Agent devices: Claude Code, Cursor, the
 * WeChat miniapp…) for the signed-in user's primary workspace. Powers the
 * miniapp drawer's "Agents 连接" list; any web surface can reuse it.
 *
 * Revoked keys are excluded — the cloud list-keys call filters them
 * server-side. Auth: connections are scoped to the user's primary
 * workspace, so anything returned belongs to this user.
 */

import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminListKeys, slugToWorkspaceId } from "@/lib/drive/admin";
import { parseName } from "@/lib/identity/connections";

export async function GET(): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }

  let keys;
  try {
    keys = await cloudAdminListKeys(slugToWorkspaceId(ws.slug));
  } catch (err) {
    return NextResponse.json(
      {
        error: "list_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const connections = keys.map((k) => {
    const { label, agentKind } = parseName(k.name);
    return {
      key_id: k.key_id,
      label,
      agent_kind: agentKind,
      last_used_at: k.last_used_at,
    };
  });

  return NextResponse.json({ ok: true, connections });
}
