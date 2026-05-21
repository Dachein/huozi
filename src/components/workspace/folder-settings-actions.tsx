"use client";

/**
 * Client-side action buttons for the Folder Settings page.
 *
 * The server component does all the read work and hands us the
 * resolved state. We POST to `/api/app/project` for the mutations
 * (upgrade / archive / unarchive) and then `router.refresh()` so the
 * server-rendered state catches up.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Action = "upgrade" | "archive" | "unarchive";

interface Props {
  folder: string;
  isProject: boolean;
  isArchived: boolean;
}

interface ErrorState {
  action: Action;
  message: string;
}

export function FolderSettingsActions({
  folder,
  isProject,
  isArchived,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  const dispatch = useCallback(
    async (action: Action) => {
      setPending(action);
      setError(null);
      try {
        const res = await fetch("/api/app/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, folder_path: folder }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          setError({
            action,
            message: body?.message ?? `Request failed (${res.status})`,
          });
          setPending(null);
          return;
        }
        // For archive / unarchive the folder name itself changes scope —
        // navigate the user to the workspace root so they don't end up on
        // a stale URL pointing at a now-empty folder.
        if (action === "archive") {
          router.push("/workspace");
          return;
        }
        if (action === "unarchive") {
          router.push(`/workspace/folder/${encodeURIComponent(folder)}`);
        } else {
          router.refresh();
        }
        setPending(null);
      } catch (err) {
        setError({
          action,
          message: err instanceof Error ? err.message : String(err),
        });
        setPending(null);
      }
    },
    [folder, router],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!isProject && !isArchived && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => dispatch("upgrade")}
            className="inline-flex items-center rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending === "upgrade" ? "Upgrading…" : "Upgrade to Project"}
          </button>
        )}
        {isProject && !isArchived && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => dispatch("archive")}
            className="inline-flex items-center rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending === "archive" ? "Archiving…" : "Archive Project"}
          </button>
        )}
        {isArchived && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => dispatch("unarchive")}
            className="inline-flex items-center rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending === "unarchive" ? "Restoring…" : "Restore from Archive"}
          </button>
        )}
      </div>
      {error && (
        <div className="rounded border border-border bg-muted px-3 py-2 text-xs text-foreground/80">
          <span className="font-medium">{error.action} failed:</span>{" "}
          {error.message}
        </div>
      )}
    </div>
  );
}
