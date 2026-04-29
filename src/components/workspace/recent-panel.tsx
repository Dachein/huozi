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
import {
  HUOZI_LIVE_COMMIT_EVENT,
  type CommitEvent,
} from "./cloud-live-events";
import { FileIcon } from "@/components/workspace/file-icon";
import { useT } from "@/lib/i18n/context";
import type { RecentEntry } from "@/lib/drive/mcp-client";

const DISPLAY_LIMIT = 10;

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
  const [entries, setEntries] = useState<LiveEntry[]>(initial);

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

  return (
    <div className="border-b border-border/50">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("recent.title")}
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          {entries.length > DISPLAY_LIMIT
            ? `${DISPLAY_LIMIT}+`
            : entries.length}
        </div>
      </div>
      <ul className="px-1 pb-2 space-y-0.5 max-h-64 overflow-y-auto">
        {entries.slice(0, DISPLAY_LIMIT).map((e) => (
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

  return (
    <li>
      <Link
        href={`/workspace/view?path=${encodeURIComponent(entry.path)}`}
        className={`group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors
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
