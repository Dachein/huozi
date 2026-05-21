import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  HUOZI_CLOUD_KEY_COOKIE,
  cloudGlob,
} from "@/lib/drive/mcp-client";
import {
  fetchProjectStatus,
  type ProjectStatus,
} from "@/lib/drive/project-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects — huozi",
  description: "Overview of all upgraded Projects in this workspace.",
};

/**
 * Projects overview — aggregate "what Projects do I have, and what
 * state are they in?" without having to click through the file tree.
 *
 * Lists every upgraded Project (anything with a `.huozi/memory.md`
 * sentinel, plus the archived siblings under `.archive/`). Each row
 * shows the memory + task counts so the human can decide which one
 * to open next. Click-through goes to the per-folder Settings page.
 */
export default async function ProjectsOverviewPage() {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(`/api/app/session/refresh?next=/workspace/projects`);
  }

  // One glob over the workspace, filter to sentinel paths. Active
  // projects: `<name>/.huozi/memory.md`. Archived: same shape under
  // `.archive/<name>/.huozi/memory.md`. We surface both — archived
  // ones get a faded state in the UI.
  const sentinels = await cloudGlob(key, "**/.huozi/memory.md");
  const active: string[] = [];
  const archived: string[] = [];
  if (sentinels.ok) {
    for (const path of sentinels.data.filenames) {
      const segs = path.split("/");
      if (segs.length === 3 && segs[1] === ".huozi") {
        // <name>/.huozi/memory.md
        if (segs[0]) active.push(segs[0]);
      } else if (segs.length === 4 && segs[0] === ".archive" && segs[2] === ".huozi") {
        // .archive/<name>/.huozi/memory.md
        if (segs[1]) archived.push(segs[1]);
      }
    }
  }
  active.sort();
  archived.sort();

  // Fetch project status (memory + task counts, archive flag) for every
  // project in parallel. fetchProjectStatus already does its own
  // archive sentinel check, so we just feed it the bare folder name —
  // it figures out the rest.
  const allFolders = Array.from(new Set([...active, ...archived]));
  const statuses = await Promise.all(
    allFolders.map((folder) => fetchProjectStatus(key, folder)),
  );

  const isEmpty = statuses.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/workspace" className="hover:text-foreground transition-colors">
          Workspace
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Projects</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          {isEmpty
            ? "No upgraded Projects yet. Use the ⚙ icon on a folder row in the file tree to upgrade one."
            : `${statuses.length} project${statuses.length === 1 ? "" : "s"} (${statuses.filter((s) => !s.isArchived).length} active, ${statuses.filter((s) => s.isArchived).length} archived).`}
        </p>
      </header>

      {!isEmpty && (
        <ul className="space-y-2">
          {statuses
            .slice()
            .sort((a, b) => {
              // Active first, archived last; then alpha within each group.
              if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
              return a.folder.localeCompare(b.folder);
            })
            .map((s) => (
              <ProjectRow key={s.folder} status={s} />
            ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({ status }: { status: ProjectStatus }) {
  const memoryHref = `/workspace/view?path=${encodeURIComponent(
    status.isArchived
      ? `.archive/${status.folder}/.huozi/memory.md`
      : `${status.folder}/.huozi/memory.md`,
  )}`;
  const tasksHref = `/workspace/view?path=${encodeURIComponent(
    status.isArchived
      ? `.archive/${status.folder}/tasks.jsonl`
      : `${status.folder}/tasks.jsonl`,
  )}`;
  const settingsHref = `/workspace/folder/${encodeURIComponent(status.folder)}`;

  return (
    <li
      className={`rounded-lg border p-4 transition-colors ${
        status.isArchived
          ? "border-border/40 bg-muted/20 opacity-70"
          : "border-border bg-background/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <Link
            href={settingsHref}
            className="text-base font-medium hover:underline truncate"
          >
            {status.folder}
          </Link>
          {status.isArchived ? (
            <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-900">
              Archived
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
              Project
            </span>
          )}
        </div>
        <Link
          href={settingsHref}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Settings ⚙
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Link
          href={memoryHref}
          className="rounded border border-border/40 bg-background/40 p-2 hover:bg-muted/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Memory
          </div>
          <div className="mt-0.5">
            <span className="text-base font-semibold">
              {status.memoryCount}
            </span>
            <span className="text-muted-foreground"> entr{status.memoryCount === 1 ? "y" : "ies"} →</span>
          </div>
        </Link>
        <Link
          href={tasksHref}
          className="rounded border border-border/40 bg-background/40 p-2 hover:bg-muted/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Tasks
          </div>
          <div className="mt-0.5">
            <span className="text-base font-semibold">{status.taskCount}</span>
            <span className="text-muted-foreground"> task{status.taskCount === 1 ? "" : "s"} →</span>
          </div>
        </Link>
      </div>
    </li>
  );
}
