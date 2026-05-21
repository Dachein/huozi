/**
 * /workspace/members
 *
 * Owner: see all members + pending invites; invite new members; remove
 * members (not self, not owners). Audit view: expand any member to see
 * their currently-issued keys (view + revoke; no edit).
 * Member: see-only member list. Own keys expandable (no others').
 */

import { SideDrawer } from "@/components/workspace/side-drawer";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListInvites,
  cloudAdminListKeys,
  cloudAdminListMembers,
  slugToWorkspaceId,
  type MemberRow,
} from "@/lib/drive/admin";
import { getServerT } from "@/lib/i18n/server";
import { MembersClient } from "./members-client";

export default async function MembersPage() {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();
  if (!principal || !principal.workspaceId || !ws) {
    return null;
  }
  const [members, invites, allKeys, _] = await Promise.all([
    cloudAdminListMembers(principal.workspaceId).catch(() => [] as MemberRow[]),
    cloudAdminListInvites(principal.workspaceId).catch(() => []),
    cloudAdminListKeys(slugToWorkspaceId(ws.slug)).catch(() => []),
    getServerT(),
  ]);
  // Edge's `principal.isAdmin` is always true for any signed-in user (single
  // trust boundary). Synthesize a member row so the admin sees themselves —
  // covers the legacy api-key path and the post-redeploy case where the JWT
  // outlives the D1 row. Owner check then matches normally.
  if (
    principal.isAdmin &&
    !members.some((m) => m.user_id === principal.userId)
  ) {
    members.unshift({
      user_id: principal.userId,
      email: principal.email ?? principal.displayLabel,
      display_name: null,
      role: "owner",
      joined_at: Date.now(),
      invited_by: null,
    });
  }
  const me = members.find((m) => m.user_id === principal.userId);
  const isOwner = me?.role === "owner" || principal.isAdmin;

  // Group keys by user. Owners see all groups; members see only their own.
  // We pre-process server-side so the client component renders pure data.
  const keysByUser = new Map<string, typeof allKeys>();
  for (const k of allKeys) {
    if (!isOwner && k.principal_id !== principal.userId) continue;
    if (k.principal_type !== "agent" && k.principal_type !== "user") continue;
    const arr = keysByUser.get(k.principal_id) ?? [];
    arr.push(k);
    keysByUser.set(k.principal_id, arr);
  }

  return (
    <SideDrawer title={_("members.title")} size="lg">
      <p className="text-sm text-muted-foreground mb-6">
        {isOwner ? _("members.subtitle.owner") : _("members.subtitle.member")}
      </p>
      <MembersClient
        currentUserId={principal.userId}
        isOwner={isOwner}
        initialMembers={members}
        initialInvites={invites}
        keysByUser={Object.fromEntries(
          Array.from(keysByUser.entries()).map(([userId, ks]) => [
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
        )}
      />
    </SideDrawer>
  );
}
