import { cache } from "react";
import { cookies } from "next/headers";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListFolderAcls,
  cloudAdminListMembers,
  type FolderAclSummary,
  type MemberRow,
} from "@/lib/drive/admin";
import {
  cloudGlob,
  cloudRecent,
  HUOZI_CLOUD_KEY_COOKIE,
  type GlobData,
  type RecentEntry,
} from "@/lib/drive/mcp-client";

/**
 * Per-request shared loader for the file-centric workspace shell. Wrapped
 * in `React.cache()` so the `(shell)/layout.tsx` and any child page that
 * needs the same numbers (workspace home stats, history breadcrumb, …)
 * hit the Worker only once per render.
 */
export const loadShellData = cache(async (): Promise<ShellData> => {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return EMPTY_SHELL;
  }

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  const [globRes, recentRes, members, folderAcls] = await Promise.all([
    cloudGlob(key, "**/*"),
    cloudRecent(key, 20),
    principal && principal.workspaceId
      ? cloudAdminListMembers(principal.workspaceId).catch(() => [])
      : Promise.resolve([] as MemberRow[]),
    principal && principal.workspaceId
      ? cloudAdminListFolderAcls({
          workspaceId: principal.workspaceId,
        }).catch(() => [])
      : Promise.resolve([] as FolderAclSummary[]),
  ]);

  const recent = recentRes.ok ? recentRes.entries : [];
  const me = members.find((m) => m.user_id === principal?.userId);
  const visibleAcls =
    me?.role === "owner"
      ? folderAcls
      : folderAcls.filter((a) =>
          principal ? a.members.includes(principal.userId) : false,
        );
  const privatePrefixes = new Set(visibleAcls.map((a) => a.path_prefix));

  const glob: GlobData = globRes.ok
    ? globRes.data
    : { durationMs: 0, numFiles: 0, filenames: [], truncated: false };

  return {
    glob,
    globOk: globRes.ok,
    globError: globRes.ok ? null : globRes.message,
    recent,
    members,
    privatePrefixes,
    currentUserId: principal?.userId,
  };
});

export interface ShellData {
  glob: GlobData;
  globOk: boolean;
  globError: string | null;
  recent: RecentEntry[];
  members: MemberRow[];
  privatePrefixes: Set<string>;
  currentUserId?: string;
}

const EMPTY_SHELL: ShellData = {
  glob: { durationMs: 0, numFiles: 0, filenames: [], truncated: false },
  globOk: true,
  globError: null,
  recent: [],
  members: [],
  privatePrefixes: new Set(),
  currentUserId: undefined,
};
