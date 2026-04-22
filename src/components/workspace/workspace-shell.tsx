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
      {/* Mobile top strip (hamburger) — hidden on lg+ */}
      <div className="lg:hidden sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60"
            aria-label="Open file tree"
          >
            <span className="text-xs">☰</span>
            <span className="text-xs">Files</span>
          </button>
          <div className="text-xs text-muted-foreground truncate max-w-[55%] font-mono">
            {currentPath ?? "workspace"}
          </div>
          <form method="POST" action="/api/app/disconnect" className="shrink-0">
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Exit
            </button>
          </form>
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
        {/* Panel */}
        <aside
          className={`absolute inset-y-0 left-0 w-[84%] max-w-sm bg-background border-r border-border shadow-xl flex flex-col transition-transform ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <span className="text-sm font-medium">
              <span className="text-accent font-serif mr-1">云</span>
              Files
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="text-lg text-muted-foreground hover:text-foreground"
              aria-label="Close file tree"
            >
              ×
            </button>
          </div>
          <TreeHeader numFiles={numFiles} truncated={truncated} />
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
}: {
  numFiles: number;
  truncated: boolean;
}) {
  return (
    <div className="border-b border-border/50 px-3 py-2 flex items-center justify-between">
      <Link
        href="/workspace"
        className="text-xs font-medium hover:text-accent transition-colors"
      >
        <span className="text-accent font-serif">云</span> Workspace
      </Link>
      <div className="text-[10px] text-muted-foreground">
        {numFiles} file{numFiles === 1 ? "" : "s"}
        {truncated ? " +" : ""}
      </div>
    </div>
  );
}
