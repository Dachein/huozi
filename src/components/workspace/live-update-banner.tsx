"use client";

/**
 * Renders inline at the top of the file view. Listens for live commit events
 * on `watchPath` and shows a concise strip about the most recent edit.
 *
 * Format:
 *   Edited by <role> <id-short> · <op> · <N chars> · <relative time>  [✕]
 *
 * We drop the filename (user is already on that file) and the commit
 * message (redundant with op / filename). Byte count comes from the
 * broadcast's `paths[*].bytes` field.
 */

import { useEffect, useState } from "react";
import {
  HUOZI_LIVE_COMMIT_EVENT,
  type CommitEvent,
} from "./cloud-live-events";

export interface LiveUpdateBannerProps {
  watchPath: string;
}

interface BannerState {
  role: "user" | "agent" | "system";
  idShort: string;
  op: string;
  bytes: number | null;
  at: number;
  freshTag: number;
}

function formatOp(op: string): string {
  switch (op) {
    case "create":
      return "new";
    case "update":
      return "edit";
    case "delete":
      return "delete";
    default:
      return op;
  }
}

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function LiveUpdateBanner({ watchPath }: LiveUpdateBannerProps) {
  const [banner, setBanner] = useState<BannerState | null>(null);

  // Re-render so "Xs ago" stays fresh while banner is visible.
  useEffect(() => {
    if (!banner) return;
    const t = setInterval(() => setBanner((b) => (b ? { ...b } : b)), 5000);
    return () => clearInterval(t);
  }, [banner]);

  useEffect(() => {
    function onCommit(e: Event) {
      const commit = (e as CustomEvent<CommitEvent>).detail;
      if (!commit || commit.type !== "commit") return;
      const entry = commit.paths.find((p) => p.path === watchPath);
      if (!entry) return;
      setBanner({
        role: commit.author.type,
        idShort: commit.author.id.slice(0, 12),
        op: entry.operation,
        bytes: typeof entry.bytes === "number" ? entry.bytes : null,
        at: commit.timestamp,
        freshTag: Date.now(),
      });
    }
    window.addEventListener(HUOZI_LIVE_COMMIT_EVENT, onCommit);
    return () => {
      window.removeEventListener(HUOZI_LIVE_COMMIT_EVENT, onCommit);
    };
  }, [watchPath]);

  if (!banner) return null;

  const roleLabel =
    banner.role === "agent"
      ? "Agent"
      : banner.role === "system"
        ? "System"
        : "User";

  return (
    <div
      key={banner.freshTag}
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground
                 animate-in fade-in slide-in-from-top-1 duration-200"
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/50 shrink-0 animate-pulse" />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Edited by </span>
        <strong>
          {roleLabel} {banner.idShort}
        </strong>
        <span className="text-muted-foreground"> · </span>
        <span>{formatOp(banner.op)}</span>
        {banner.bytes !== null && (
          <>
            <span className="text-muted-foreground"> · </span>
            <span className="tabular-nums">{formatBytes(banner.bytes)}</span>
          </>
        )}
        <span className="text-muted-foreground"> · </span>
        <span className="text-muted-foreground">
          {formatRelative(banner.at)}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setBanner(null)}
        className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
        aria-label="dismiss"
      >
        ✕
      </button>
    </div>
  );
}
