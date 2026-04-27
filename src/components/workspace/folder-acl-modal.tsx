"use client";

/**
 * Folder ACL editor modal — opens from a "..." button next to any folder
 * in the workspace file tree. Replaces the dedicated /workspace/folders
 * page for the common "I want this folder private" case; the page form
 * is still useful for locking paths that don't physically exist yet.
 *
 * State machine:
 *   loading   → fetching the folder's current ACL on open
 *   public    → no ACL row exists; toggle to "private + members"
 *   private   → ACL row exists; edit member list / unlock back to public
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";

interface MemberLite {
  user_id: string;
  email: string;
  display_name: string | null;
}

interface FolderAcl {
  workspace_id: string;
  path_prefix: string;
  mode: "private";
  members: string[];
  last_changed_by: string;
  last_changed_at: number;
}

export interface FolderAclModalProps {
  open: boolean;
  /** Workspace-relative folder path WITHOUT trailing slash, e.g. "funds/fund-A". */
  folderPath: string;
  members: MemberLite[];
  currentUserId: string;
  onClose: () => void;
}

export function FolderAclModal({
  open,
  folderPath,
  members,
  currentUserId,
  onClose,
}: FolderAclModalProps) {
  const _ = useT();
  const router = useRouter();
  const pathPrefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
  const [acl, setAcl] = useState<FolderAcl | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [draftMembers, setDraftMembers] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"public" | "private">("public");

  // Fetch the current ACL each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/app/folder-acl");
        if (!res.ok) throw new Error("fetch_failed");
        const j = (await res.json()) as { acls: FolderAcl[] };
        const found = j.acls.find((a) => a.path_prefix === pathPrefix);
        setAcl(found ?? null);
        setMode(found ? "private" : "public");
        setDraftMembers(new Set(found?.members ?? [currentUserId]));
      } catch {
        setError(translateError("load_failed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathPrefix]);

  function translateError(code: string): string {
    const key = `folders.error.${code}`;
    const t = _(key);
    return t === key ? code : t;
  }

  function toggleMember(uid: string) {
    setDraftMembers((cur) => {
      const next = new Set(cur);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function save() {
    setError("");
    if (mode === "private") {
      if (draftMembers.size === 0) {
        setError(translateError("empty_members"));
        return;
      }
      if (!draftMembers.has(currentUserId)) {
        setError(translateError("self_excluded"));
        return;
      }
      startTransition(async () => {
        const res = await fetch("/api/app/folder-acl", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path_prefix: pathPrefix,
            members: Array.from(draftMembers),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(translateError(body.error ?? "update_failed"));
          return;
        }
        onClose();
        router.refresh();
      });
    } else {
      // public: delete ACL row if one exists
      if (!acl) {
        onClose();
        return;
      }
      if (!confirm(_("folders.makePublicConfirm"))) return;
      startTransition(async () => {
        const res = await fetch(
          `/api/app/folder-acl?path_prefix=${encodeURIComponent(pathPrefix)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(translateError(body.error ?? "update_failed"));
          return;
        }
        onClose();
        router.refresh();
      });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/60">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {_("folders.modal.heading")}
          </div>
          <p className="font-mono text-sm truncate" title={pathPrefix}>
            {pathPrefix}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("public")}
                  disabled={pending}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    mode === "public"
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="font-medium">
                    {_("folders.modal.publicTitle")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {_("folders.modal.publicHint")}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("private")}
                  disabled={pending}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    mode === "private"
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="font-medium">
                    {_("folders.modal.privateTitle")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {_("folders.modal.privateHint")}
                  </div>
                </button>
              </div>

              {/* Members picker (only shown when private) */}
              {mode === "private" && (
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    {_("folders.members.heading")}
                  </div>
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {members.map((m) => (
                      <li key={m.user_id}>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftMembers.has(m.user_id)}
                            onChange={() => toggleMember(m.user_id)}
                            disabled={
                              m.user_id === currentUserId || pending
                            }
                          />
                          <span className="truncate">
                            {m.display_name || m.email}
                            {m.user_id === currentUserId && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {_("folders.members.you")}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-40"
          >
            {_("folders.list.cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || loading}
            className="rounded-full bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {pending ? _("folders.create.submitting") : _("folders.list.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
