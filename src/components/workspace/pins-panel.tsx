"use client";

/**
 * "Pins" pane in the workspace sidebar — sibling of <RecentPanel>.
 * Lists the user's pinned files (from <PinProvider>); hidden when
 * empty. Each row navigates to the file and carries an inline star to
 * unpin in place.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PinButton, PinIcon } from "./pin-button";
import { usePins } from "./pin-context";
import { FileIcon } from "@/components/workspace/file-icon";
import { useWorkspaceNav } from "@/components/workspace/nav-pending";
import { useT } from "@/lib/i18n/context";

export function PinsPanel({
  currentPath: currentPathProp,
}: {
  currentPath?: string | null;
}) {
  const t = useT();
  const { pins } = usePins();
  const pathname = usePathname();
  const search = useSearchParams();
  const derivedPath =
    pathname === "/workspace/view" || pathname === "/workspace/history"
      ? (search.get("path") ?? null)
      : null;
  const currentPath = currentPathProp ?? derivedPath;

  const list = [...pins].sort((a, b) => a.localeCompare(b));
  if (list.length === 0) return null;

  return (
    <div className="border-b border-border/50">
      <div className="px-3 py-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <PinIcon filled size={11} />
        {t("pin.title")}
      </div>
      <ul className="px-1 pb-2 space-y-0.5 max-h-64 overflow-y-auto">
        {list.map((p) => (
          <PinRow key={p} path={p} current={p === currentPath} />
        ))}
      </ul>
    </div>
  );
}

function PinRow({
  path,
  current,
}: {
  path: string;
  current: boolean;
}) {
  const { navigate } = useWorkspaceNav();
  const base = path.split("/").pop() ?? path;
  const parent = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : "";
  const href = `/workspace/view?path=${encodeURIComponent(path)}`;

  return (
    <li>
      <Link
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) {
            return;
          }
          e.preventDefault();
          navigate(href);
        }}
        aria-current={current ? "page" : undefined}
        title={path}
        className={`huozi-row group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
          current ? "bg-muted/60" : "hover:bg-muted/40"
        }`}
      >
        <span className="shrink-0 self-start mt-0.5">
          <FileIcon name={base} isDir={false} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono">{base}</span>
          {parent && (
            <span className="block truncate text-[10px] text-muted-foreground/70">
              {parent}/
            </span>
          )}
        </span>
        <PinButton path={path} variant="row" revealOnHover />
      </Link>
    </li>
  );
}
