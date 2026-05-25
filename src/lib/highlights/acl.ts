/**
 * Ensure the current user's clippings folder is locked down to a
 * single-member private ACL.
 *
 * Called from the BFF before every clipping write. The underlying
 * admin endpoint is idempotent — POSTing the same {workspace_id,
 * path_prefix} with the same members list is a no-op. The cost is one
 * extra cloud-worker round-trip per write; we accept it because:
 *
 *   - It guarantees the ACL is present even if the user never visited
 *     /workspace/members (the legacy entry that creates folder ACLs).
 *   - It catches the case where an admin/user reset the ACL out from
 *     under us — next clip re-installs it.
 *
 * Read paths don't need this — without a clippings.jsonl, there's
 * nothing to leak; once the file exists, the ACL is already in place
 * because we set it on the create call that produced the file.
 */

import { cloudAdminSetFolderAcl } from "@/lib/drive/admin"
import { clippingsAclPathPrefix } from "./types"

export async function ensureClippingsAcl(
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await cloudAdminSetFolderAcl({
    workspace_id: workspaceId,
    path_prefix: clippingsAclPathPrefix(userId),
    mode: "private",
    members: [userId],
    changed_by: userId,
  })
  if (!res.ok) {
    return { ok: false, message: res.message ?? res.error }
  }
  return { ok: true }
}
