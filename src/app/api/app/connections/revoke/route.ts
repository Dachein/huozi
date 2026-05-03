/**
 * POST /api/connections/revoke
 *
 * Soft-deletes an API key. Permission rules:
 *   - own key (caller.userId == key.principal_id) → always allowed
 *   - owner with revoke_any_key cap                → allowed (audit cleanup)
 *   - else                                         → 403
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListKeys,
  cloudAdminListMembers,
  cloudAdminRevokeKey,
} from "@/lib/drive/admin";
import { ROLE_CAPS, type Role } from "@/lib/permissions";

interface RevokeBody {
  key_id?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal || !principal.workspaceId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const keyId = (body.key_id ?? "").trim();
  if (!keyId) {
    return NextResponse.json({ error: "missing_key_id" }, { status: 400 });
  }

  // Look up the key in the workspace and the caller's role in parallel.
  const [keys, members] = await Promise.all([
    cloudAdminListKeys(principal.workspaceId).catch(() => []),
    cloudAdminListMembers(principal.workspaceId).catch(() => []),
  ]);
  const key = keys.find((k) => k.key_id === keyId);
  if (!key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const me = members.find((m) => m.user_id === principal.userId);
  const role: Role | null =
    me?.role === "owner" || me?.role === "member"
      ? me.role
      : principal.isAdmin
        ? "owner"
        : null;
  if (!role) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  const myOwn = key.principal_id === principal.userId;
  const canRevokeAny = ROLE_CAPS[role].has("revoke_any_key");
  if (!myOwn && !canRevokeAny) {
    return NextResponse.json(
      { error: "permission_denied" },
      { status: 403 },
    );
  }

  try {
    await cloudAdminRevokeKey(keyId);
  } catch (err) {
    return NextResponse.json(
      {
        error: "revoke_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, key_id: keyId });
}
