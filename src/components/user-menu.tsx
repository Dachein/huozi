"use client";

/**
 * Header user menu — left-anchored identity trigger.
 *
 * Trigger: `字 / <workspace-slug>` (or `字 huozi` pre-workspace). Clicking it
 * opens a dropdown with:
 *   - the signed-in principal label (email / admin)
 *   - a small 4-glyph locale picker
 *   - Exit (POSTs to /api/app/disconnect)
 *
 * This consolidates what used to live in three separate header elements
 * (workspace breadcrumb + LocaleSwitcher pill + "Exit" link) into one
 * Notion/Linear-style workspace-identity menu. Keeps the right side of the
 * header free for primary navigation.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LocaleGrid } from "@/components/locale-grid";
import { ThemeGrid } from "@/components/theme-grid";
import { Icon } from "@/components/icon";
import { useT } from "@/lib/i18n/context";
import { isEdge } from "@/lib/edition";
import type { Principal, Workspace } from "@/lib/identity";
import type { Theme } from "@/lib/theme";

export interface WorkspaceOption {
  id: string;
  slug: string;
  name: string;
}

export interface UserMenuProps {
  principal: Principal;
  workspace: Workspace | null;
  memberships: WorkspaceOption[];
  /** Active theme — passed in from the server layout so the ThemeGrid
   *  highlights the correct tile without a hydration round-trip. */
  theme: Theme;
}

export function UserMenu({
  principal,
  workspace,
  memberships,
  theme,
}: UserMenuProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Other workspaces (not the currently active one). Hidden when the user
  // belongs to ≤1 workspace — switcher would be a single dead row.
  const otherWorkspaces = memberships.filter(
    (m) => m.id !== workspace?.id,
  );
  const showSwitcher = memberships.length > 1;

  // Bulletproof reset: when the workspace prop changes (i.e. a switch
  // landed and server-side props refreshed), zero out `switching`. Without
  // this, the component instance survives router.refresh() and keeps
  // `switching` set to the previous click's target — disabling every
  // button until the user does a hard reload.
  useEffect(() => {
    setSwitching(null);
  }, [workspace?.id]);

  async function switchTo(ws: WorkspaceOption) {
    setSwitching(ws.id);
    try {
      const res = await fetch("/api/auth/select-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: ws.id }),
      });
      if (!res.ok) return;
      setOpen(false);
      // Land on /workspace so the user sees the new workspace's files
      // immediately rather than the equivalent path in the old one.
      router.push(`/workspace?joined=${encodeURIComponent(ws.slug)}`);
      router.refresh();
    } finally {
      // Always clear — covers both error path and the (rare) case where
      // the workspace prop change in the useEffect above doesn't fire.
      setSwitching(null);
    }
  }

  const filesActive =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/view") ||
    pathname.startsWith("/workspace/history");
  const sharesActive = pathname.startsWith("/workspace/shares");
  const membersActive = pathname.startsWith("/workspace/members");

  // Close on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const exitLabel = isEdge() ? t("menu.disconnect") : t("menu.exit");
  const exitTitle = `${t("menu.identity.signedIn")} · ${principal.displayLabel}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`huozi-app-trigger group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm
                   transition-colors min-w-0
                   ${open ? "bg-muted" : "hover:bg-muted/60"}`}
      >
        <Icon
          name="brand"
          className="text-base font-bold text-accent shrink-0"
        />
        {workspace ? (
          <>
            <span className="hidden sm:inline text-border">/</span>
            <span
              className="text-sm font-mono truncate text-muted-foreground group-hover:text-foreground max-w-[140px] sm:max-w-none"
              title={workspace.slug}
            >
              {workspace.slug}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground group-hover:text-foreground">
            huozi
          </span>
        )}
        <Icon
          name="chevron-down"
          className={`opacity-50 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute left-0 top-full mt-1.5 w-[260px] z-40
                     rounded-md border border-border bg-background shadow-lg
                     animate-in fade-in slide-in-from-top-1 duration-150
                     overflow-hidden"
        >
          {/* Identity row */}
          <div className="px-3 py-2.5 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {t("menu.identity.signedIn")}
            </div>
            <div
              className="text-sm truncate font-mono"
              title={principal.displayLabel}
            >
              {principal.displayLabel}
            </div>
            {workspace && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("menu.identity.workspace")} ·{" "}
                <span className="font-mono">{workspace.slug}</span>
              </div>
            )}
          </div>

          {/* Language row */}
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("menu.language")}
            </div>
            <LocaleGrid onPick={() => setOpen(false)} />
          </div>

          {/* Theme row */}
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("menu.theme")}
            </div>
            <ThemeGrid current={theme} onPick={() => setOpen(false)} />
          </div>

          {/* Switch workspace — only renders when the user belongs to 2+
              workspaces. A single-workspace user has nothing to switch to,
              so we keep the menu compact for them. */}
          {showSwitcher && otherWorkspaces.length > 0 && (
            <div className="py-1 border-b border-border/60">
              <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("switcher.heading")}
              </div>
              {otherWorkspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => switchTo(ws)}
                  disabled={switching !== null}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm
                             text-muted-foreground hover:bg-muted/60 hover:text-foreground
                             transition-colors disabled:opacity-50 text-left"
                >
                  <span className="min-w-0 truncate">
                    <span className="block font-medium truncate">{ws.name}</span>
                    <span className="block text-xs font-mono text-muted-foreground/80 truncate">
                      {ws.slug}
                    </span>
                  </span>
                  <span className="text-xs shrink-0">
                    {switching === ws.id ? (
                      "…"
                    ) : (
                      <Icon name="arrow-right" />
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Workspace section — Files is the primary view; Shares is
              the per-link management page. Key management lives inside
              the workspace StatusSummary (inline), so there is no
              dedicated Keys link anymore. Active-route highlighted. */}
          <nav className="py-1 border-b border-border/60">
            <NavRow
              href="/workspace"
              active={filesActive}
              onClick={() => setOpen(false)}
              icon={<Icon name="files" className="text-accent" />}
              label={t("menu.nav.files")}
            />
            <NavRow
              href="/workspace/shares"
              active={sharesActive}
              onClick={() => setOpen(false)}
              icon={<Icon name="external" className="text-[13px]" />}
              label={t("menu.nav.shares")}
            />
            <NavRow
              href="/workspace/members"
              active={membersActive}
              onClick={() => setOpen(false)}
              icon={<Icon name="members" className="text-accent" />}
              label={t("menu.nav.members")}
            />
          </nav>

          {/* huozi.app home */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors border-b border-border/60"
          >
            <span>{t("menu.home")}</span>
            <Icon name="external" className="text-muted-foreground" />
          </Link>

          {/* Exit */}
          <form method="POST" action="/api/app/disconnect">
            <button
              type="submit"
              title={exitTitle}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-left"
            >
              <span>{exitLabel}</span>
              <Icon name="arrow-right" className="text-xs opacity-60" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface NavRowProps {
  href: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function NavRow({ href, active, onClick, icon, label }: NavRowProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors
                 ${
                   active
                     ? "bg-muted/70 text-foreground font-medium"
                     : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                 }`}
    >
      <span className="w-4 text-center text-muted-foreground/70" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
