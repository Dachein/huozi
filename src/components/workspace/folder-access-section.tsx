"use client";

/**
 * Folder access summary + "Manage access" trigger for the Folder
 * Settings page. Wraps the existing FolderAclModal so the file tree
 * can stay as a single-icon (⋯ → Settings) affordance — ACL editing
 * lives here instead.
 */

import { useState } from "react";
import { FolderAclModal } from "@/components/workspace/folder-acl-modal";

interface MemberLite {
  user_id: string;
  email: string;
  display_name: string | null;
}

export function FolderAccessSection({
  folder,
  isPrivate,
  memberCount,
  members,
  currentUserId,
}: {
  folder: string;
  /** True when there's an ACL row pinning this folder to a member set. */
  isPrivate: boolean;
  memberCount: number;
  members: MemberLite[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <AccessChip isPrivate={isPrivate} memberCount={memberCount} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center rounded-md border border-border bg-background/50 px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          Manage access
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isPrivate
          ? `Only ${memberCount} workspace member${memberCount === 1 ? "" : "s"} can read or write files under this folder.`
          : "Every workspace member can read and write files under this folder."}
      </p>
      {open && (
        <FolderAclModal
          open={true}
          folderPath={folder}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AccessChip({
  isPrivate,
  memberCount,
}: {
  isPrivate: boolean;
  memberCount: number;
}) {
  if (isPrivate) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
        <span aria-hidden className="size-1.5 rounded-full bg-amber-600" />
        Private — {memberCount} member{memberCount === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50" />
      Public to workspace
    </span>
  );
}
