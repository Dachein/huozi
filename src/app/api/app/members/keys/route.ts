/**
 * GET /api/app/members/keys
 *
 * Returns workspace api keys grouped by principal_id (user_id).
 *   - members: returns only their own group
 *   - owners: returns all groups (audit / cleanup view)
 *
 * Drives the expandable key list under each member on /workspace/members.
 */

import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListKeys,
  cloudAdminListMembers,
  slugToWorkspaceId,
  type ListedKey,
} from "@/lib/drive/admin";

export async function GET(): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();
  if (!principal || !principal.workspaceId || !ws) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const [members, allKeys] = await Promise.all([
    cloudAdminListMembers(principal.workspaceId).catch(() => []),
    cloudAdminListKeys(slugToWorkspaceId(ws.slug)).catch(() => []),
  ]);
  const me = members.find((m) => m.user_id === principal.userId);
  const isOwner = me?.role === "owner" || principal.isAdmin;

  const grouped: Record<string, ListedKey[]> = {};
  for (const k of allKeys) {
    if (!isOwner && k.principal_id !== principal.userId) continue;
    if (k.principal_type !== "agent" && k.principal_type !== "user") continue;
    (grouped[k.principal_id] ??= []).push(k);
  }
  // Trim payload to what the UI needs.
  const slim = Object.fromEntries(
    Object.entries(grouped).map(([userId, ks]) => [
      userId,
      ks.map((k) => ({
        key_id: k.key_id,
        name: k.name,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        expires_at: k.expires_at,
        ttl_seconds: k.ttl_seconds,
        principal_type: k.principal_type,
      })),
    ]),
  );

  return NextResponse.json({ ok: true, keysByUser: slim });
}
