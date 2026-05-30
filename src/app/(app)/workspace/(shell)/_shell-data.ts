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
import { memoize, invalidatePrefix } from "@/lib/memo-cache";

/**
 * Per-request shared loader for the file-centric workspace shell. Wrapped
 * in `React.cache()` so the `(shell)/layout.tsx` and any child page that
 * needs the same numbers (workspace home stats, history breadcrumb, …)
 * hit the Worker only once per render.
 *
 * Cross-request caching: each of the 4 underlying cloud reads (glob /
 * recent / members / folder ACLs) is layered through `memoize()` with a
 * TTL. Without this every navigation re-fetches the full workspace
 * sidebar — typically the largest single cost in SSR. TTLs are tuned per
 * volatility:
 *   - glob ("**\/*"):   30s  — file list churns when users save / delete
 *   - recent:           10s  — surfaces last-edited file quickly
 *   - members:          120s — rare changes
 *   - folder ACLs:      120s — rare changes
 *
 * Mutation routes that change these surfaces MUST call
 * `invalidateShellCache(userKey)` so the next reader sees fresh data.
 */
export const loadShellData = cache(async (): Promise<ShellData> => {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    return EMPTY_SHELL;
  }

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const userKey = shellCacheKey(key);
  const wsKey = principal?.workspaceId ?? "anon";

  const [globRes, recentRes, members, folderAcls] = await Promise.all([
    memoize(`glob:${userKey}`, 30_000, () => cloudGlob(key, "**/*")),
    memoize(`recent:${userKey}`, 10_000, () => cloudRecent(key, 20)),
    principal && principal.workspaceId
      ? memoize(`members:${wsKey}`, 120_000, () =>
          cloudAdminListMembers(principal.workspaceId!).catch(
            () => [] as MemberRow[],
          ),
        )
      : Promise.resolve([] as MemberRow[]),
    principal && principal.workspaceId
      ? memoize(`acls:${wsKey}`, 120_000, () =>
          cloudAdminListFolderAcls({
            workspaceId: principal.workspaceId!,
          }).catch(() => [] as FolderAclSummary[]),
        )
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

/** Canonical cache-key suffix derived from the user's api_key. Keys
 *  are opaque randoms, so a tail slice is uniquely identifying without
 *  storing the full secret in process memory. Mutation routes pass the
 *  same cookie value to keep keys aligned. */
export function shellCacheKey(apiKey: string): string {
  return apiKey.slice(-12);
}

/** Drop every shell-data entry for this user. Call this from any route
 *  that creates, deletes, renames, or moves a file in the user's
 *  workspace (edit, delete, mv, etc.). */
export function invalidateShellCache(userKey: string): void {
  invalidatePrefix(`glob:${userKey}`);
  invalidatePrefix(`recent:${userKey}`);
}

/** Members / ACL cache is workspace-scoped (not per user). Mutation
 *  routes that change membership or ACLs call this. */
export function invalidateWorkspaceMeta(workspaceId: string): void {
  invalidatePrefix(`members:${workspaceId}`);
  invalidatePrefix(`acls:${workspaceId}`);
}

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
