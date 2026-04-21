"use client";

/**
 * Single dropdown that consolidates the secondary actions for a file view:
 * render / source toggle, history link, publish (future), and collapsed
 * meta. Closes on click-outside + ESC.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface FileActionsMenuProps {
  path: string;
  wantRaw: boolean;
  offset?: number;
  limit?: number;
  /** Rendered is only meaningful for a subset of file types. */
  canRender: boolean;
  totalLines: number | null;
  size: number | null;
  mimeType: string | null;
  blobSha: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileActionsMenu(props: FileActionsMenuProps) {
  const { path, wantRaw, offset, limit, canRender, totalLines, size, mimeType, blobSha } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const qs = new URLSearchParams();
  qs.set("path", path);
  if (offset !== undefined) qs.set("offset", String(offset));
  if (limit !== undefined) qs.set("limit", String(limit));
  const renderedHref = `/cloud/workspace/view?${qs.toString()}`;
  qs.set("view", "raw");
  const sourceHref = `/cloud/workspace/view?${qs.toString()}`;
  const historyHref = `/cloud/workspace/history?path=${encodeURIComponent(path)}`;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label="File actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center rounded-md border border-transparent
                   w-7 h-7 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60
                   ${open ? "bg-muted/60 text-foreground" : ""}`}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[220px] z-30
                     rounded-md border border-border bg-background shadow-lg
                     py-1 text-sm
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {canRender && (
            <>
              <MenuLink
                href={renderedHref}
                active={!wantRaw}
                onClick={() => setOpen(false)}
              >
                Rendered
              </MenuLink>
              <MenuLink
                href={sourceHref}
                active={wantRaw}
                onClick={() => setOpen(false)}
              >
                Source
              </MenuLink>
              <Separator />
            </>
          )}
          <MenuLink href={historyHref} onClick={() => setOpen(false)}>
            History →
          </MenuLink>
          <MenuDisabled>Publish · soon</MenuDisabled>
          <Separator />
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground space-y-0.5 font-mono">
            {totalLines !== null && (
              <div>
                {totalLines} line{totalLines === 1 ? "" : "s"}
                {size !== null && <> · {formatBytes(size)}</>}
              </div>
            )}
            {blobSha && (
              <div className="break-all opacity-80">
                blob_sha: {blobSha.slice(0, 14)}…
              </div>
            )}
            {mimeType && <div className="opacity-80">mime: {mimeType}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 transition-colors
                 ${active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      <span className="w-3 text-xs text-accent">{active ? "✓" : ""}</span>
      <span>{children}</span>
    </Link>
  );
}

function MenuDisabled({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground/50 cursor-not-allowed select-none">
      <span className="w-3 text-xs"></span>
      <span>{children}</span>
    </div>
  );
}

function Separator() {
  return <div className="my-1 border-t border-border/50" />;
}
