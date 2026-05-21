import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FolderAccessSection } from "@/components/workspace/folder-access-section";
import { FolderSettingsActions } from "@/components/workspace/folder-settings-actions";
import {
  cloudAdminListFolderAcls,
  cloudAdminListMembers,
} from "@/lib/drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { fetchProjectStatus } from "@/lib/drive/project-actions";
import { getIdentity } from "@/lib/identity";

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

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const workspaceId = principal?.workspaceId ?? null;

  const [status, members, acls] = await Promise.all([
    fetchProjectStatus(key, folder),
    workspaceId
      ? cloudAdminListMembers(workspaceId).catch(() => [])
      : Promise.resolve([]),
    workspaceId
      ? cloudAdminListFolderAcls({ workspaceId }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const folderPrefix = `${folder}/`;
  const acl = acls.find((a) => a.path_prefix === folderPrefix) ?? null;

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
                ? "Sentinel: .huozi/memory.md"
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
                href={`/workspace/view?path=${encodeURIComponent(`${folder}/.huozi/memory.md`)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                .huozi/memory.md
              </Link>
              <span className="text-muted-foreground"> — agent memory ({status.memoryCount} entr{status.memoryCount === 1 ? "y" : "ies"})</span>
            </li>
          </ul>
        </section>
      )}

      {/* Folder access — was the ⋯ modal on the file tree before P2.4
          file-tree consolidation. Now lives here so the file tree stays
          single-affordance. */}
      {principal && workspaceId && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Folder access
          </h2>
          <FolderAccessSection
            folder={folder}
            isPrivate={acl !== null}
            memberCount={acl?.members.length ?? 0}
            members={members}
            currentUserId={principal.userId}
          />
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
  // All status chips share one shape — rounded border + bg-muted base,
  // a single accented dot for state. Keeps the page brutalist-aligned
  // (no rounded-full pills) and themable via tokens.
  if (isArchived) {
    return <StatusPill label="Archived" tone="muted" />;
  }
  if (isProject) {
    return <StatusPill label="Project" tone="accent" />;
  }
  return <StatusPill label="Folder" tone="muted" />;
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "muted";
}) {
  const dot =
    tone === "accent"
      ? "bg-emerald-600"
      : "bg-muted-foreground/50";
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {label}
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
    <div className="huozi-card rounded border border-border bg-background/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
