/**
 * GET    /api/app/folder-acl                      → list private folders the
 *                                                   caller can see (owner: all;
 *                                                   member: only ones they're in)
 * POST   /api/app/folder-acl                      → create / replace a folder ACL
 *      { path_prefix, members[] }                  caller must be in current ACL
 *                                                   OR folder is currently public
 *                                                   (anyone-with-write may lock it)
 * DELETE /api/app/folder-acl?path_prefix=...      → make folder public again
 *                                                   caller must be in current ACL
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminDeleteFolderAcl,
  cloudAdminListFolderAcls,
  cloudAdminListMembers,
  cloudAdminSetFolderAcl,
} from "@/lib/drive/admin";
import {
  HUOZI_CLOUD_KEY_COOKIE,
  cloudMkdir,
} from "@/lib/drive/mcp-client";

async function requireMembership(): Promise<
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      role: string;
    }
  | { ok: false; status: number; error: string }
> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal || !principal.workspaceId) {
    return { ok: false, status: 401, error: "not_authenticated" };
  }
  const members = await cloudAdminListMembers(principal.workspaceId).catch(
    () => [],
  );
  const me = members.find((m) => m.user_id === principal.userId);
  if (!me) {
    return { ok: false, status: 403, error: "not_a_member" };
  }
  return {
    ok: true,
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    role: me.role,
  };
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireMembership();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const acls = await cloudAdminListFolderAcls({
    workspaceId: auth.workspaceId,
  });
  // Member view: only show ACLs they're in. Owner sees all.
  const visible =
    auth.role === "owner"
      ? acls
      : acls.filter((a) => a.members.includes(auth.userId));
  return NextResponse.json({ ok: true, acls: visible });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMembership();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { path_prefix?: string; members?: string[] };
  try {
    body = (await req.json()) as { path_prefix?: string; members?: string[] };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const pathPrefix = (body.path_prefix ?? "").trim();
  const members = body.members ?? [];
  if (!pathPrefix) {
    return NextResponse.json({ error: "missing_path_prefix" }, { status: 400 });
  }
  if (members.length === 0) {
    return NextResponse.json(
      { error: "empty_members" },
      { status: 400 },
    );
  }

  // Authorization: if folder is currently private, caller must already
  // be in its ACL. If it's public, any workspace member may lock it.
  const existing = await cloudAdminListFolderAcls({
    workspaceId: auth.workspaceId,
    pathPrefix,
  });
  if (existing.length > 0) {
    const acl = existing[0]!;
    if (!acl.members.includes(auth.userId)) {
      return NextResponse.json(
        { error: "not_in_acl" },
        { status: 403 },
      );
    }
  }

  // Validate every requested member is actually a workspace member.
  const wsMembers = await cloudAdminListMembers(auth.workspaceId);
  const wsMemberIds = new Set(wsMembers.map((m) => m.user_id));
  for (const m of members) {
    if (!wsMemberIds.has(m)) {
      return NextResponse.json(
        { error: "member_not_in_workspace", message: m },
        { status: 400 },
      );
    }
  }
  // Caller must remain in the new ACL (per the egalitarian design — you
  // can only edit an ACL you're in, so locking yourself out makes the
  // folder unrecoverable).
  if (!members.includes(auth.userId)) {
    return NextResponse.json(
      {
        error: "self_excluded",
        message: "you must keep yourself in the ACL",
      },
      { status: 400 },
    );
  }

  const result = await cloudAdminSetFolderAcl({
    workspace_id: auth.workspaceId,
    path_prefix: pathPrefix,
    mode: "private",
    members,
    changed_by: auth.userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status },
    );
  }

  // Materialize the folder if it doesn't exist yet — write a `.huozi-keep`
  // placeholder so the file tree shows it. The user's browser-session API
  // key (cookie) acts as the writer; since we just put them in the ACL,
  // the write will pass the freshly-installed gate.
  // Best-effort: ACL was successfully set even if mkdir fails (e.g. cookie
  // missing for some reason); the folder will appear once any real file
  // is written.
  if (existing.length === 0) {
    const cookieStore = await cookies();
    const sessionKey = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
    if (sessionKey) {
      const folderPath = pathPrefix.replace(/\/+$/, "");
      await cloudMkdir(sessionKey, folderPath).catch(() => {
        /* swallow — ACL is the source of truth */
      });
    }
  }

  return NextResponse.json({ ok: true, acl: result.acl });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMembership();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const pathPrefix = url.searchParams.get("path_prefix");
  if (!pathPrefix) {
    return NextResponse.json({ error: "missing_path_prefix" }, { status: 400 });
  }
  const existing = await cloudAdminListFolderAcls({
    workspaceId: auth.workspaceId,
    pathPrefix,
  });
  if (existing.length === 0) {
    return NextResponse.json({ ok: true }); // already public
  }
  if (!existing[0]!.members.includes(auth.userId)) {
    return NextResponse.json({ error: "not_in_acl" }, { status: 403 });
  }
  await cloudAdminDeleteFolderAcl({
    workspaceId: auth.workspaceId,
    pathPrefix,
  });
  return NextResponse.json({ ok: true });
}
