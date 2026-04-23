/**
 * POST /api/app/connections/update-ttl
 *
 * Change the inactivity TTL (sliding-window lifetime) of an API key that
 * belongs to the signed-in user's workspace.
 *
 * Body: { key_id: string; ttl_seconds: number | null }
 *   - ttl_seconds = null   → key never expires
 *   - ttl_seconds = <int>  → key dies after this many seconds of inactivity
 *
 * Worker recomputes expires_at server-side from last_used_at (or
 * created_at) + ttl_seconds, so the change takes effect immediately.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListKeys,
  cloudAdminUpdateKeyTtl,
  slugToWorkspaceId,
} from "@/lib/drive/admin";

interface Body {
  key_id?: string;
  ttl_seconds?: number | null;
}

// Only allow the presets we advertise in the UI. Prevents someone from
// crafting a 1-second TTL or a negative one.
const ALLOWED_TTL_SECONDS = new Set<number | null>([
  1 * 86400,
  7 * 86400,
  30 * 86400,
  180 * 86400,
  null,
]);

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
  const keyId = (body.key_id ?? "").trim();
  if (!keyId) {
    return NextResponse.json({ error: "missing_key_id" }, { status: 400 });
  }
  const ttl =
    body.ttl_seconds === null || body.ttl_seconds === undefined
      ? null
      : Number(body.ttl_seconds);
  if (ttl !== null && (!Number.isFinite(ttl) || ttl <= 0)) {
    return NextResponse.json({ error: "invalid_ttl_seconds" }, { status: 400 });
  }
  if (!ALLOWED_TTL_SECONDS.has(ttl)) {
    return NextResponse.json(
      { error: "unsupported_ttl_preset" },
      { status: 400 },
    );
  }

  // Authorization: the principal must own the workspace this key belongs to.
  // Supabase happy path first (keys minted via Connect-Agent UI have a
  // companion cloud_connections row). Fall back to a Worker D1 lookup for
  // keys that were minted via device-flow / admin / bootstrap paths and
  // never got a Supabase row — those still belong to the user iff they
  // live under the user's primary workspace on the Worker side.
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
    const result = await cloudAdminUpdateKeyTtl(keyId, ttl);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: "update_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
