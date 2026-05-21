import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FolderSettingsActions } from "@/components/workspace/folder-settings-actions";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { fetchProjectStatus } from "@/lib/drive/project-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  return {
    title: `${decoded} — huozi`,
    description: `Settings and Project state for the ${decoded} folder.`,
  };
}

export default async function FolderSettingsPage({ params }: PageProps) {
  const { name } = await params;
  const folder = decodeURIComponent(name);

  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(`/api/app/session/refresh?next=/workspace/folder/${name}`);
  }

  const status = await fetchProjectStatus(key, folder);
  // Live source the page derives values from. The status object is the
  // single source of truth — read by both the action bar (so it can
  // show the right CTAs) and the chrome below.

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
      {/* Breadcrumb back to workspace */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/workspace" className="hover:text-foreground transition-colors">
          Workspace
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{folder}</span>
      </nav>

      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{folder}</h1>
          <ProjectStatusChip
            isProject={status.isProject}
            isArchived={status.isArchived}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {status.isArchived
            ? `Archived. Lives under .archive/${folder}/. Restore to bring it back to the top level.`
            : status.isProject
              ? "Upgraded Project. Tasks, memory, and README live in this folder."
              : "Plain folder. Upgrade to give it a tasks.jsonl + agent memory."}
        </p>
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Tasks"
          value={status.isProject ? String(status.taskCount) : "—"}
          hint={
            status.isProject
              ? "Distinct entities in tasks.jsonl"
              : "Available after Upgrade"
          }
        />
        <StatTile
          label="Memory entries"
          value={status.isProject ? String(status.memoryCount) : "—"}
          hint={
            status.isProject
              ? "Active records after fold (supersede / tombstone applied)"
              : "Available after Upgrade"
          }
        />
        <StatTile
          label="State"
          value={
            status.isArchived
              ? "Archived"
              : status.isProject
                ? "Project"
                : "Folder"
          }
          hint={
            status.isArchived
              ? ".archive/<folder>/"
              : status.isProject
                ? "Sentinel: .huozi/memory.jsonl"
                : "No sentinel — Upgrade to mint one"
          }
        />
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Actions
        </h2>
        <FolderSettingsActions
          folder={folder}
          isProject={status.isProject}
          isArchived={status.isArchived}
        />
      </section>

      {/* Quick links */}
      {status.isProject && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Open
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li>
              <Link
                href={`/workspace/view?path=${encodeURIComponent(`${folder}/README.md`)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                README.md
              </Link>
              <span className="text-muted-foreground"> — project overview</span>
            </li>
            <li>
              <Link
                href={`/workspace/view?path=${encodeURIComponent(`${folder}/tasks.jsonl`)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                tasks.jsonl
              </Link>
              <span className="text-muted-foreground"> — task entities ({status.taskCount})</span>
            </li>
            <li>
              <Link
                href={`/workspace/view?path=${encodeURIComponent(`${folder}/.huozi/memory.jsonl`)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                .huozi/memory.jsonl
              </Link>
              <span className="text-muted-foreground"> — agent memory ({status.memoryCount})</span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectStatusChip({
  isProject,
  isArchived,
}: {
  isProject: boolean;
  isArchived: boolean;
}) {
  if (isArchived) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-900">
        Archived
      </span>
    );
  }
  if (isProject) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
        Project
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Folder
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
