"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FileTree, type MemberLite } from "./file-tree";
import { RecentPanel } from "./recent-panel";
import { NavLoadingBar, WorkspaceNavProvider } from "./nav-pending";
import { useT } from "@/lib/i18n/context";
import type { RecentEntry } from "@/lib/drive/mcp-client";

export interface WorkspaceShellProps {
  paths: string[];
  currentPath?: string | null;
  numFiles: number;
  truncated: boolean;
  /** Seed data for the live-updating "Recent" pane. Safe to omit. */
  recent?: RecentEntry[];
  /** Main content. Rendered in the primary column. */
  children: React.ReactNode;
  // ── Folder-ACL surface (passed straight through to FileTree) ───────
  privatePrefixes?: Set<string>;
  members?: MemberLite[];
  currentUserId?: string;
}

/**
 * Responsive workspace layout:
 *   ≥ lg : fixed left tree + main column
 *   < lg : tree lives behind a slide-in drawer (hamburger top-left)
 *
 * Intentionally no external UI library — one small transform-based drawer +
 * a backdrop. Keeps bundle lean and respects existing design tokens.
 */
export function WorkspaceShell({
  paths,
  currentPath: currentPathProp,
  numFiles,
  truncated,
  recent,
  children,
  privatePrefixes,
  members,
  currentUserId,
}: WorkspaceShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The shared `(shell)/layout.tsx` can't read searchParams from a server
  // layout, so it never passes `currentPath`. Mirror the FileTree /
  // RecentPanel fallback here for the mobile breadcrumb strip.
  const pathname = usePathname();
  const search = useSearchParams();
  const derivedPath =
    pathname === "/workspace/view" || pathname === "/workspace/history"
      ? (search.get("path") ?? null)
      : null;
  const currentPath = currentPathProp ?? derivedPath;

  // Close drawer on ESC
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const tree = (
    <FileTree
      paths={paths}
      currentPath={currentPath ?? null}
      onNavigate={() => setDrawerOpen(false)}
      privatePrefixes={privatePrefixes}
      members={members}
      currentUserId={currentUserId}
    />
  );

  return (
    <WorkspaceNavProvider>
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Mobile top strip (hamburger) — hidden on lg+.
          Exit / language now live in the AppHeader's UserMenu, so this
          strip only carries the tree toggle + current path. */}
      <div className="lg:hidden sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60 shrink-0"
            aria-label="Open file tree"
          >
            <span className="text-xs">☰</span>
            <span className="text-xs">Files</span>
          </button>
          <div className="text-xs text-muted-foreground truncate font-mono flex-1 min-w-0">
            {currentPath ?? "workspace"}
          </div>
        </div>
      </div>

      {/* Desktop fixed tree ≥ lg */}
      <aside className="huozi-shell-panel hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 lg:border-r lg:border-border/50 lg:h-[calc(100vh-var(--shell-header-height))] lg:sticky lg:top-[var(--shell-header-height)] lg:overflow-hidden">
        <TreeHeader numFiles={numFiles} truncated={truncated} />
        {recent && recent.length > 0 && (
          <RecentPanel initial={recent} currentPath={currentPath ?? null} />
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{tree}</div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-foreground/30 backdrop-blur-sm transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setDrawerOpen(false)}
        />
        {/* Panel — TreeHeader doubles as the drawer header via onClose,
            so we don't get two redundant "Files / Workspace" rows. */}
        <aside
          className={`huozi-shell-panel absolute inset-y-0 left-0 w-[84%] max-w-sm bg-background border-r border-border shadow-xl flex flex-col transition-transform ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <TreeHeader
            numFiles={numFiles}
            truncated={truncated}
            onClose={() => setDrawerOpen(false)}
          />
          {recent && recent.length > 0 && (
            <RecentPanel initial={recent} currentPath={currentPath ?? null} />
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">{tree}</div>
        </aside>
      </div>

      {/* Main content. Most routes are reading surfaces and stay inside the
          centered max-w-4xl gutter. List+detail surfaces (mail + .jsonl view)
          break out so the email-style 3-pane can span the full viewport.
          `min-h-0` is load-bearing: without it the flex column reverts to
          min-height:auto (= its content's natural height), breaking the
          height chain so descendant scroll panes can't compute a usable
          height under the (shell) layout's fixed-viewport cap. */}
      <main className="flex-1 min-w-0 min-h-0 relative flex flex-col">
        <NavLoadingBar />
        {/* `min-h-0` keeps propagating the flex height cap — same
            reason as <main>: without it this inner column reverts to
            min-height:auto and child `flex-1 min-h-0` chains can't
            allocate, which leaves FileHeader floating mid-page. */}
        <div
          className={
            isWideLayout(pathname, currentPath)
              ? "w-full flex-1 min-h-0 flex flex-col px-3 sm:px-4 pt-3"
              : "mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 flex-1 min-h-0 flex flex-col"
          }
        >
          {children}
        </div>
      </main>
    </div>
    </WorkspaceNavProvider>
  );
}

/**
 * Routes that adopt the email/Linear 3-pane layout. They escape the
 * centered max-w-4xl reading gutter so list + detail can span the full
 * viewport width.
 */
function isWideLayout(
  pathname: string | null,
  currentPath: string | null,
): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/workspace/mail")) return true;
  if (pathname === "/workspace/view") {
    return !!currentPath && currentPath.endsWith(".jsonl");
  }
  return false;
}

function TreeHeader({
  numFiles,
  truncated,
  onClose,
}: {
  numFiles: number;
  truncated: boolean;
  /** When provided, renders a close X (used in the mobile drawer). */
  onClose?: () => void;
}) {
  const t = useT();
  return (
    <div className="border-b border-border/50 px-3 py-2.5 flex items-center justify-between gap-3">
      <Link
        href="/workspace"
        title={`${t("ws.shell.title")} · ${t("ws.shell.subtitle")}`}
        className="group flex items-center gap-2 min-w-0 hover:text-accent transition-colors"
      >
        <WorkspaceHomeIcon />
        <span className="flex flex-col min-w-0 leading-tight">
          <span className="text-xs font-semibold truncate">
            {t("ws.shell.title")}
          </span>
          <span className="text-[10px] text-muted-foreground group-hover:text-accent/80 truncate">
            {t("ws.shell.subtitle")}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-[10px] text-muted-foreground">
          {numFiles} file{numFiles === 1 ? "" : "s"}
          {truncated ? " +" : ""}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file tree"
            className="-mr-1 text-base text-muted-foreground hover:text-foreground leading-none w-6 h-6 flex items-center justify-center"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** A small "stacked papers + magnifier" mark — same warm-paper line
 *  weight as the file-type icons. Doubles as a home / manage hint. */
function WorkspaceHomeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      {/* back panel */}
      <rect
        x="2.5"
        y="3"
        width="9"
        height="8"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* front panel offset */}
      <rect
        x="4.5"
        y="5"
        width="9"
        height="8"
        rx="1.2"
        fill="rgba(196,89,74,0.10)"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* small magnifier inside the front panel */}
      <circle cx="8.4" cy="8.6" r="1.4" stroke="currentColor" strokeWidth="1.1" />
      <line
        x1="9.5"
        y1="9.7"
        x2="11.2"
        y2="11.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
