/**
 * POST /api/connections/revoke
 *
 * Revokes an API key belonging to the signed-in user's workspace.
 * Marks the cloud_connections row as revoked AND deletes the hashed key
 * from huozi-cloud so it can't be used anymore.
 *
 * Body: { key_id: string }
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminRevokeKey } from "@/lib/drive/admin";

interface RevokeBody {
  key_id?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
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

  // Authorization: the principal must own the workspace this key belongs to.
  const owns = await identity.ownsConnection(keyId);
  if (!owns) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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

  try {
    await identity.markConnectionRevoked(keyId);
  } catch (err) {
    return NextResponse.json(
      {
        error: "mark_revoked_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, key_id: keyId });
}
