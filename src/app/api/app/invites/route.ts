/**
 * POST /api/app/invites
 * GET  /api/app/invites
 * DELETE /api/app/invites?token=…
 *
 * Workspace owner mints / lists / revokes invites. Owner-only — enforced
 * by checking the principal's role in workspace_members.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListInvites,
  cloudAdminListMembers,
  cloudAdminMintInvite,
  cloudAdminRevokeInvite,
} from "@/lib/drive/admin";

async function requireOwner(): Promise<
  | { ok: true; principal: { userId: string }; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return { ok: false, status: 401, error: "not_authenticated" };
  }
  if (!principal.workspaceId) {
    return { ok: false, status: 400, error: "no_workspace" };
  }
  const members = await cloudAdminListMembers(principal.workspaceId).catch(
    () => [],
  );
  const me = members.find((m) => m.user_id === principal.userId);
  if (!me || me.role !== "owner") {
    return { ok: false, status: 403, error: "owner_only" };
  }
  return {
    ok: true,
    principal: { userId: principal.userId },
    workspaceId: principal.workspaceId,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const result = await cloudAdminMintInvite({
    workspace_id: auth.workspaceId,
    email,
    role: "member",
    invited_by: auth.principal.userId,
    accept_url_base: `${origin}/invite`,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    expires_at: result.expires_at,
    accept_url: result.accept_url,
  });
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const invites = await cloudAdminListInvites(auth.workspaceId);
  return NextResponse.json({ ok: true, invites });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  await cloudAdminRevokeInvite(token);
  return NextResponse.json({ ok: true });
}
