import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { loadShellData } from "./_shell-data";

/**
 * Shared shell for the file-centric workspace routes (home, mail, assets,
 * view, history). Lives in a route group `(shell)` so the URLs stay flat
 * (`/workspace`, `/workspace/mail`, …) while Next.js preserves this layout
 * across sub-route navigations — the file tree + recent pane + ACL state
 * load once and survive the swap.
 *
 * Routes that intentionally don't want the shell (members, shares,
 * tasks-email, a/[...path], d/[host]) live one level up under `/workspace`
 * and don't traverse this layout.
 *
 * The actual loader lives in `_shell-data.ts` wrapped in `React.cache()`
 * so a child page can call it for its own stats without firing the
 * Worker calls a second time.
 */
export default async function WorkspaceShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(
      `/api/app/session/refresh?next=${encodeURIComponent("/workspace")}`,
    );
  }

  const shell = await loadShellData();

  // Cap the shell area at the exact viewport height (minus the app
  // header) so descendants can enforce internal scroll inside their
  // own panes. Without this cap, `min-h-screen` lets the page grow
  // taller than the viewport and the whole body scrolls — which
  // unpins the FileHeader (A) on long jsonl/mail lists.
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - var(--shell-header-height))" }}
    >
      <WorkspaceShell
        paths={shell.glob.filenames}
        numFiles={shell.glob.numFiles}
        truncated={shell.glob.truncated}
        recent={shell.recent}
        privatePrefixes={shell.privatePrefixes}
        members={shell.members.map((m) => ({
          user_id: m.user_id,
          email: m.email,
          display_name: m.display_name,
        }))}
        currentUserId={shell.currentUserId}
      >
        {children}
      </WorkspaceShell>
    </div>
  );
}
