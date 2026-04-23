"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileTree } from "./file-tree";
import { RecentPanel } from "./recent-panel";
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
  currentPath,
  numFiles,
  truncated,
  recent,
  children,
}: WorkspaceShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    />
  );

  return (
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
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 lg:border-r lg:border-border/50 lg:h-[calc(100vh-56px)] lg:sticky lg:top-14 lg:overflow-hidden">
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
          className={`absolute inset-y-0 left-0 w-[84%] max-w-sm bg-background border-r border-border shadow-xl flex flex-col transition-transform ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
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

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">{children}</div>
      </main>
    </div>
  );
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
  return (
    <div className="border-b border-border/50 px-3 py-2 flex items-center justify-between gap-3">
      <Link
        href="/workspace"
        className="text-xs font-medium hover:text-accent transition-colors truncate"
      >
        <span className="text-accent font-serif">云</span> Workspace
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
