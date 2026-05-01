"use client";

/**
 * Single dropdown that consolidates the secondary actions for a file view:
 * render / source toggle, history link, publish (future), and collapsed
 * meta. Closes on click-outside + ESC.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PublishDialog } from "./publish-dialog";

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
  const [publishOpen, setPublishOpen] = useState(false);
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
  const renderedHref = `/workspace/view?${qs.toString()}`;
  qs.set("view", "raw");
  const sourceHref = `/workspace/view?${qs.toString()}`;
  const historyHref = `/workspace/history?path=${encodeURIComponent(path)}`;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label="File actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`huozi-button group inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 h-8
                   text-xs font-medium transition-colors
                   ${
                     open
                       ? "border-foreground/40 bg-muted text-foreground"
                       : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
                   }`}
      >
        <span className="text-base leading-none -mt-0.5" aria-hidden>
          ⋯
        </span>
        <span className="hidden sm:inline">Actions</span>
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <PublishDialog
        path={path}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
      />
      {open && (
        <div
          role="menu"
          className="huozi-app-menu absolute right-0 top-full mt-1 min-w-[220px] z-30
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
          <MenuButton
            onClick={() => {
              setOpen(false);
              setPublishOpen(true);
            }}
          >
            Publish / Share…
          </MenuButton>
          <MenuLink href="/workspace/shares" onClick={() => setOpen(false)}>
            Manage shares →
          </MenuLink>
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
      aria-current={active ? "page" : undefined}
      className={`huozi-row flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 transition-colors
                 ${active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      <span className="w-3 text-xs text-accent">{active ? "✓" : ""}</span>
      <span>{children}</span>
    </Link>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="huozi-row w-full flex items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <span className="w-3 text-xs"></span>
      <span>{children}</span>
    </button>
  );
}

function Separator() {
  return <div className="my-1 border-t border-border/50" />;
}
