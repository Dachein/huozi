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
import { isSystemPath } from "@/lib/file-types";

// The agent-facing huozi_glob default is 100 (token-budget friendly), but the
// web file tree renders the whole workspace client-side (tree + search + type
// counts all consume this flat list), so request a much higher cap. Beyond
// this, hierarchical lazy-loading would be the next step.
const WORKSPACE_GLOB_LIMIT = 5000;

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
    memoize(`glob:${userKey}`, 30_000, () =>
      cloudGlob(key, "**/*", undefined, { limit: WORKSPACE_GLOB_LIMIT }),
    ),
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

  // Project folders = any folder carrying `.huozi/memory.md`. Derived from
  // the *raw* file list (the sentinel is itself a dot path that the filters
  // below strip), and needed to classify `<project>/tasks.jsonl` as system.
  const projectFolders = deriveProjectFolders(glob.filenames);

  // `glob` stays raw: the FileTree owns its own hide-dot toggle + derives
  // Project status from the raw paths, so feeding it a filtered list would
  // break both. `visiblePaths` is the browse/search-facing list with system
  // junk removed (assets are kept — they surface via the file-tree
  // SYSTEM_DIRS and the recent "assets" tab).
  const visiblePaths = glob.filenames.filter(
    (p) => !isSystemPath(p, projectFolders),
  );

  // Recent: drop system paths (fixes `.huozi/*` writes leaking into Recent)
  // but keep `__assets__` so the panel's assets tab isn't empty.
  const visibleRecent = recent.filter((r) => !isSystemPath(r.path, projectFolders));

  return {
    glob,
    visiblePaths,
    projectFolders,
    globOk: globRes.ok,
    globError: globRes.ok ? null : globRes.message,
    recent: visibleRecent,
    members,
    privatePrefixes,
    currentUserId: principal?.userId,
  };
});

const PROJECT_SENTINEL_SUFFIX = "/.huozi/memory.md";

/** Folders carrying `.huozi/memory.md` — the Project marker. Used to
 *  classify `<project>/tasks.jsonl` as a system path. */
function deriveProjectFolders(filenames: string[]): string[] {
  const out: string[] = [];
  for (const p of filenames) {
    if (p.endsWith(PROJECT_SENTINEL_SUFFIX)) {
      out.push(p.slice(0, -PROJECT_SENTINEL_SUFFIX.length));
    }
  }
  return out;
}

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
  /** Raw file list — FileTree consumes this (owns its own dot-toggle and
   *  derives Project status from the raw sentinel paths). */
  glob: GlobData;
  /** Browse/search-facing file list with system junk removed (assets kept). */
  visiblePaths: string[];
  /** Folders carrying `.huozi/memory.md`; classifies project task stores. */
  projectFolders: string[];
  globOk: boolean;
  globError: string | null;
  recent: RecentEntry[];
  members: MemberRow[];
  privatePrefixes: Set<string>;
  currentUserId?: string;
}

const EMPTY_SHELL: ShellData = {
  glob: { durationMs: 0, numFiles: 0, filenames: [], truncated: false },
  visiblePaths: [],
  projectFolders: [],
  globOk: true,
  globError: null,
  recent: [],
  members: [],
  privatePrefixes: new Set(),
  currentUserId: undefined,
};
