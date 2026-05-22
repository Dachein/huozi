import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EnableTasksButton } from "@/components/workspace/enable-tasks-button";
import { FolderAccessSection } from "@/components/workspace/folder-access-section";
import { FolderSettingsActions } from "@/components/workspace/folder-settings-actions";
import { SideDrawer } from "@/components/workspace/side-drawer";
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

  // Top section state — collapses "is this a Project?" and "is Tasks
  // enabled?" into two list rows. State + lifecycle button live on the
  // same row so the action that flips the state is co-located with the
  // state itself. No more separate "Actions" section.
  const projectRowLabel = status.isArchived
    ? "Archived"
    : status.isProject
      ? "Project"
      : "Folder";
  const projectRowTone: RowTone = status.isArchived
    ? "muted"
    : status.isProject
      ? "active"
      : "off";
  const projectRowHint = status.isArchived
    ? `Archived under .archive/${folder}/. Restore to bring it back.`
    : status.isProject
      ? "tasks.jsonl + agent memory live in this folder."
      : "Plain folder. Upgrade to mint a sentinel + agent memory.";

  return (
    <SideDrawer title={folder}>
      <div className="space-y-8">
        {/* PROJECT — status + lifecycle controls collapsed into a 2-row
            list. Each row carries its own action button on the right so
            you read the state and the affordance that flips it on the
            same line. The Tasks row only renders for upgraded,
            non-archived projects (it has nothing to say otherwise). */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Project
          </h2>
          <div className="overflow-hidden rounded border border-border bg-background/50 divide-y divide-border">
            <StatusRow
              label={projectRowLabel}
              tone={projectRowTone}
              hint={projectRowHint}
              action={
                <FolderSettingsActions
                  folder={folder}
                  isProject={status.isProject}
                  isArchived={status.isArchived}
                />
              }
            />
            {status.isProject && !status.isArchived && (
              <StatusRow
                label="Tasks"
                tone={status.isTasksEnabled ? "active" : "off"}
                hint={
                  status.isTasksEnabled
                    ? "Tracking enabled — tasks.jsonl is live in this folder."
                    : "Off by default. Enable to start tracking action items."
                }
                action={
                  status.isTasksEnabled ? null : (
                    <EnableTasksButton folder={folder} />
                  )
                }
              />
            )}
          </div>
        </section>

        {/* FEATURES — content cards. Status badges are gone (status is
            owned by the Project section above). Each card focuses on
            the count + Open. Tasks-off renders the card but greys out
            and drops the Open button: the user is told *to* go enable
            it from the Project section. */}
        {status.isProject && !status.isArchived && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Features
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FeatureCard
                title="README"
                openHref={`/workspace/view?path=${encodeURIComponent(`${folder}/README.md`)}`}
              />
              <FeatureCard
                title="Memory"
                value={status.memoryCount}
                valueSuffix={
                  status.memoryCount === 1 ? "entry" : "entries"
                }
                openHref={`/workspace/view?path=${encodeURIComponent(`${folder}/.huozi/memory.md`)}`}
              />
              <FeatureCard
                title="Tasks"
                value={status.isTasksEnabled ? status.taskCount : null}
                valueSuffix={
                  status.isTasksEnabled
                    ? status.taskCount === 1
                      ? "entity"
                      : "entities"
                    : undefined
                }
                openHref={
                  status.isTasksEnabled
                    ? `/workspace/view?path=${encodeURIComponent(`${folder}/tasks.jsonl`)}`
                    : null
                }
              />
            </div>
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
    </SideDrawer>
  );
}

type RowTone = "active" | "off" | "muted";

function StatusRow({
  label,
  tone,
  hint,
  action,
}: {
  label: string;
  tone: RowTone;
  hint: string;
  action: React.ReactNode;
}) {
  const dot =
    tone === "active"
      ? "bg-emerald-600"
      : tone === "muted"
        ? "bg-muted-foreground/50"
        : "border border-muted-foreground/40 bg-transparent";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          aria-hidden
          className={`size-2 rounded-full shrink-0 ${dot}`}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
      {action !== null && (
        <div className="shrink-0">{action}</div>
      )}
    </div>
  );
}

function FeatureCard({
  title,
  value,
  valueSuffix,
  openHref,
}: {
  title: string;
  /** Count to display large. `null` means "—" (feature dormant or
   *  countless, e.g. README). `undefined` means "no number column". */
  value?: number | null;
  valueSuffix?: string;
  /** Set to `null` to drop the Open button entirely (e.g. Tasks-off). */
  openHref: string | null;
}) {
  const showValue = value !== undefined;
  const disabled = openHref === null;
  return (
    <div
      className={`huozi-card flex flex-col gap-3 rounded border border-border bg-background/50 p-3 ${disabled ? "opacity-60" : ""}`}
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {showValue ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">
            {value === null ? "—" : value}
          </span>
          {valueSuffix && (
            <span className="text-[11px] text-muted-foreground">
              {valueSuffix}
            </span>
          )}
        </div>
      ) : null}
      <div className="mt-auto">
        {openHref !== null && (
          <Link
            href={openHref}
            className="inline-flex w-fit items-center rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Open
          </Link>
        )}
      </div>
    </div>
  );
}
