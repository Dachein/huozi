/**
 * GET /api/app/connections/status?key_id=...
 *
 * Returns the current last_used_at timestamp for a key that belongs to the
 * signed-in user's workspace. Used by the Connect-Agent UI to detect when
 * an Agent has actually started talking to the Worker after the user
 * pasted the snippet — closing the loop on install confirmation.
 *
 * Auth: the key must exist in the user's primary-workspace key list.
 * Worker-side listing is scoped by workspace, so anything that matches
 * there belongs to this user.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminListKeys, slugToWorkspaceId } from "@/lib/drive/admin";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const keyId = (new URL(req.url).searchParams.get("key_id") ?? "").trim();
  if (!keyId) {
    return NextResponse.json({ error: "missing_key_id" }, { status: 400 });
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

  const k = keys.find((x) => x.key_id === keyId);
  if (!k) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    key_id: keyId,
    last_used_at: k.last_used_at,
  });
}
