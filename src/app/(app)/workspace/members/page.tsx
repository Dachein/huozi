/**
 * /workspace/members
 *
 * Owner: see all members + pending invites; invite new members; remove
 * members (not self, not owners). Audit view: expand any member to see
 * their currently-issued keys (view + revoke; no edit).
 * Member: see-only member list. Own keys expandable (no others').
 */

import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListInvites,
  cloudAdminListKeys,
  cloudAdminListMembers,
  slugToWorkspaceId,
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
    cloudAdminListMembers(principal.workspaceId).catch(() => []),
    cloudAdminListInvites(principal.workspaceId).catch(() => []),
    cloudAdminListKeys(slugToWorkspaceId(ws.slug)).catch(() => []),
    getServerT(),
  ]);
  const me = members.find((m) => m.user_id === principal.userId);
  // Edge's `principal.isAdmin` is always true for any signed-in user (single
  // trust boundary). Treat it as owner so the invite form still renders even
  // when the legacy api-key path leaves no `workspace_members` row to match.
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
        {_("members.title")}
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
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
    </main>
  );
}
