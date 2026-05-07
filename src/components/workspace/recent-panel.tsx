"use client";

/**
 * "Recently touched" pane that lives at the top of the workspace sidebar.
 *
 * Data source:
 *   - Initial: server-side `cloudRecent()` call (via `initial` prop)
 *   - Live: listens on the window event dispatched by `<CloudLiveEvents>`
 *     and prepends new entries
 *
 * Each new entry briefly pulses with an "editing" animation before settling
 * into the list.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceNav } from "@/components/workspace/nav-pending";
import {
  HUOZI_LIVE_COMMIT_EVENT,
  type CommitEvent,
} from "./cloud-live-events";
import { FileIcon } from "@/components/workspace/file-icon";
import { useT } from "@/lib/i18n/context";
import type { RecentEntry } from "@/lib/drive/mcp-client";

const DISPLAY_LIMIT = 10;
const ASSETS_PREFIX = "__assets__/";
const VIEW_LS_KEY = "huozi-cloud:recent-view";

type RecentView = "works" | "assets";

export interface RecentPanelProps {
  initial: RecentEntry[];
  currentPath?: string | null;
}

interface LiveEntry extends RecentEntry {
  /** Set when the entry arrives via WS — triggers the flash animation. */
  freshTag?: number;
}

export function RecentPanel({
  initial,
  currentPath: currentPathProp,
}: RecentPanelProps) {
  const t = useT();
  // Same trick as FileTree: when the caller can't supply currentPath
  // (server layouts have no searchParams), fall back to the URL so the
  // active-row highlight updates immediately on navigation.
  const pathname = usePathname();
  const search = useSearchParams();
  const derivedPath =
    pathname === "/workspace/view" ? (search.get("path") ?? null) : null;
  const currentPath = currentPathProp ?? derivedPath;
  // Server-side recent() returns one row per (commit × path), so a file
  // touched twice shows up twice. Collapse on path here too — same dedup
  // policy the live-update branch already applies — so the user sees one
  // row per file with the newest timestamp / op, and the active-row
  // highlight has exactly one target to bind to.
  const [entries, setEntries] = useState<LiveEntry[]>(() =>
    dedupByPath(initial),
  );
  // Default = "works" (non-asset files). The asset bucket is full of
  // hash-named PNG blobs and dominates Recent if mixed in.
  const [view, setViewState] = useState<RecentView>("works");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(VIEW_LS_KEY);
      if (raw === "assets" || raw === "works") setViewState(raw);
    } catch {
      // ignore
    }
  }, []);

  const setView = (next: RecentView) => {
    setViewState(next);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VIEW_LS_KEY, next);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    function onCommit(e: Event) {
      const detail = (e as CustomEvent<CommitEvent>).detail;
      if (!detail || detail.type !== "commit") return;

      // Each commit may touch multiple paths — prepend one row per path.
      const newRows: LiveEntry[] = detail.paths.map((p) => ({
        path: p.path,
        operation: p.operation,
        commit_sha: detail.commit_sha,
        timestamp: detail.timestamp,
        author: detail.author,
        message: detail.message,
        in_batch: detail.paths.length,
        freshTag: Date.now(),
      }));

      setEntries((prev) => {
        // Drop any existing rows for the same paths so the newest surfaces to
        // the top without duplicates.
        const newPaths = new Set(newRows.map((r) => r.path));
        const filtered = prev.filter((r) => !newPaths.has(r.path));
        return [...newRows, ...filtered].slice(0, DISPLAY_LIMIT * 2);
      });
    }

    window.addEventListener(HUOZI_LIVE_COMMIT_EVENT, onCommit);
    return () => {
      window.removeEventListener(HUOZI_LIVE_COMMIT_EVENT, onCommit);
    };
  }, []);

  if (entries.length === 0) return null;

  const visible =
    view === "works"
      ? entries.filter((e) => !e.path.startsWith(ASSETS_PREFIX))
      : entries.filter((e) => e.path.startsWith(ASSETS_PREFIX));

  return (
    <div className="border-b border-border/50">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
          {t("recent.title")}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label={t("recent.filter.view.label")}
            className="inline-flex rounded border border-border overflow-hidden"
          >
            <ViewTab
              active={view === "works"}
              onClick={() => setView("works")}
              label={t("recent.filter.view.works")}
            />
            <ViewTab
              active={view === "assets"}
              onClick={() => setView("assets")}
              label={t("recent.filter.view.assets")}
            />
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            {visible.length > DISPLAY_LIMIT
              ? `${DISPLAY_LIMIT}+`
              : visible.length}
          </div>
        </div>
      </div>
      <ul className="px-1 pb-2 space-y-0.5 max-h-64 overflow-y-auto">
        {visible.slice(0, DISPLAY_LIMIT).map((e) => (
          <RecentRow
            key={e.path + ":" + e.commit_sha}
            entry={e}
            current={e.path === currentPath}
          />
        ))}
      </ul>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      {label}
    </button>
  );
}

function RecentRow({
  entry,
  current,
}: {
  entry: LiveEntry;
  current: boolean;
}) {
  const t = useT();
  const [flashing, setFlashing] = useState(false);
  const lastTag = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (entry.freshTag && entry.freshTag !== lastTag.current) {
      lastTag.current = entry.freshTag;
      setFlashing(true);
      const tm = setTimeout(() => setFlashing(false), 1200);
      return () => clearTimeout(tm);
    }
  }, [entry.freshTag]);

  const base = entry.path.split("/").pop() ?? entry.path;
  const parent = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : "";

  // .huozi-keep is the hidden marker huozi_mkdir writes to reserve an
  // empty folder. Show the parent path *as* the row title so the user
  // sees "xiaoji" (or "layer1/layer2") instead of the implementation
  // detail. The folder icon still applies. The hover tooltip is also
  // rewritten so the user never sees the .huozi-keep path leak.
  const isFolderMarker = base === ".huozi-keep";
  const titleText = isFolderMarker ? parent || base : base;
  const parentText = isFolderMarker ? "" : parent;
  const tooltipText = isFolderMarker
    ? `${parent || base}/ — ${t("recent.folderCreated")}`
    : `${entry.path} — ${entry.message}`;

  const opLabel = opText(entry.operation, entry.in_batch, t);
  // create / delete keep semantic colors (green / red); plain edits stay
  // foreground-default — they're the common case and shouldn't feel alarming.
  const opColor =
    entry.operation === "create"
      ? "text-emerald-600"
      : entry.operation === "delete"
        ? "text-red-500"
        : "text-foreground/70";

  const href = `/workspace/view?path=${encodeURIComponent(entry.path)}`;
  const { navigate } = useWorkspaceNav();

  return (
    <li>
      <Link
        href={href}
        onClick={(e) => {
          // Keep modifier-clicks (cmd/ctrl/middle/shift) as
          // open-in-new-tab; intercept plain clicks so the main column
          // flips to the skeleton without waiting for the server.
          if (
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.button === 1
          ) {
            return;
          }
          e.preventDefault();
          navigate(href);
        }}
        aria-current={current ? "page" : undefined}
        className={`huozi-row group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors
                   ${current ? "bg-muted/60" : "hover:bg-muted/40"}
                   ${flashing ? "ring-1 ring-accent/60 bg-accent/10 animate-pulse" : ""}`}
        title={tooltipText}
      >
        <span className="shrink-0 self-start mt-0.5">
          <FileIcon name={base} isDir={false} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono">{titleText}</span>
          <span className="block truncate text-[10px] text-muted-foreground/70">
            <span className={`mr-1 ${opColor}`}>[{opLabel}]</span>
            {parentText && <span>{parentText}/</span>}
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/80 tabular-nums self-start mt-0.5">
          {formatRelative(entry.timestamp)}
        </span>
      </Link>
    </li>
  );
}

/**
 * Keep only the newest row per path. Initial input is already in
 * newest-first order from the server, so a Set-driven first-seen-wins
 * pass is correct.
 */
function dedupByPath(rows: RecentEntry[]): LiveEntry[] {
  const seen = new Set<string>();
  const out: LiveEntry[] = [];
  for (const r of rows) {
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    out.push(r);
  }
  return out;
}

function opText(
  op: string,
  inBatch: number,
  t: (key: string) => string,
): string {
  if (inBatch > 1) return `×${inBatch}`;
  switch (op) {
    case "create":
      return t("recent.op.new");
    case "update":
      return t("recent.op.edited");
    case "delete":
      return t("recent.op.deleted");
    default:
      return op;
  }
}

/** "5s", "3m", "2h", "4d"-style relative timestamp. Updates are rare enough
 *  that we don't bother re-rendering on a timer; the parent re-renders when
 *  new commits arrive. */
function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
