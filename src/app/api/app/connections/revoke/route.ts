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
import {
  cloudAdminListKeys,
  cloudAdminRevokeKey,
  slugToWorkspaceId,
} from "@/lib/drive/admin";

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
  // Supabase-first, Worker D1 fallback — mirrors the update-ttl route.
  // See the longer comment there for context on why both paths exist.
  let owns = await identity.ownsConnection(keyId);
  if (!owns) {
    const ws = await identity.getPrimaryWorkspace();
    if (ws) {
      try {
        const keys = await cloudAdminListKeys(slugToWorkspaceId(ws.slug));
        owns = keys.some((k) => k.key_id === keyId);
      } catch {
        // fall through — owns stays false
      }
    }
  }
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
