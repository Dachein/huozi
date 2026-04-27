/**
 * GET    /api/app/members          → list current workspace's members
 * DELETE /api/app/members?user_id  → owner removes a member (not self)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListMembers,
  cloudAdminRemoveMember,
} from "@/lib/drive/admin";

export async function GET(): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal || !principal.workspaceId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const members = await cloudAdminListMembers(principal.workspaceId);
  // Anyone in the workspace can see the member list (no secret in there).
  if (!members.some((m) => m.user_id === principal.userId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, members });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal || !principal.workspaceId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }
  if (userId === principal.userId) {
    return NextResponse.json(
      { error: "cannot_remove_self" },
      { status: 400 },
    );
  }
  const members = await cloudAdminListMembers(principal.workspaceId);
  const me = members.find((m) => m.user_id === principal.userId);
  if (!me || me.role !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 });
  }
  const result = await cloudAdminRemoveMember({
    workspace_id: principal.workspaceId,
    user_id: userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "remove_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
