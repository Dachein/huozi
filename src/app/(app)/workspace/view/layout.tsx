import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListFolderAcls,
  cloudAdminListMembers,
} from "@/lib/drive/admin";
import {
  cloudGlob,
  cloudRecent,
  HUOZI_CLOUD_KEY_COOKIE,
} from "@/lib/drive/mcp-client";

/**
 * Persistent shell for `/workspace/view`. The tree, recent pane, and
 * member/ACL state live here so they survive the page-segment swap when
 * the user clicks a different file. Only `page.tsx` re-runs on
 * `?path=` change, which lets `loading.tsx` paint the skeleton in the
 * main column while the sidebar stays stable.
 */
export default async function ViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(
      `/api/app/session/refresh?next=${encodeURIComponent("/workspace/view")}`,
    );
  }

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  const [globRes, recentRes, members, folderAcls] = await Promise.all([
    cloudGlob(key, "**/*"),
    cloudRecent(key, 20),
    principal && principal.workspaceId
      ? cloudAdminListMembers(principal.workspaceId).catch(() => [])
      : Promise.resolve([]),
    principal && principal.workspaceId
      ? cloudAdminListFolderAcls({
          workspaceId: principal.workspaceId,
        }).catch(() => [])
      : Promise.resolve([]),
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

  const paths = globRes.ok ? globRes.data.filenames : [];
  const numFiles = globRes.ok ? globRes.data.numFiles : 0;
  const truncated = globRes.ok ? globRes.data.truncated : false;

  return (
    <div className="flex flex-col min-h-screen">
      <WorkspaceShell
        paths={paths}
        numFiles={numFiles}
        truncated={truncated}
        recent={recent}
        privatePrefixes={privatePrefixes}
        members={members.map((m) => ({
          user_id: m.user_id,
          email: m.email,
          display_name: m.display_name,
        }))}
        currentUserId={principal?.userId}
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
