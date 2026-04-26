"use client";

/**
 * Inline page-outline pill — sits in the file-view header next to
 * Fullscreen / Actions, and expands to a dropdown listing every page in
 * the document. Used in both the workspace inline preview and the
 * published /p/<slug> page so the chrome is identical across surfaces.
 *
 * Closes on click-outside + Escape, mirroring FileActionsMenu.
 *
 * Active-page highlight via IntersectionObserver scoped to the
 * page elements identified by their id (huozi multi-page convention:
 * `<section data-page id="…">`). Observer runs always (not just when the
 * dropdown is open) so the label stays in sync.
 */

import { useEffect, useRef, useState } from "react";
import type { PageEntry } from "@/lib/html/extract-pages";

export interface PageOutlineMenuProps {
  pages: PageEntry[];
  /** Singular noun for the dropdown label. "page" / "slide" / "sheet". */
  unit?: "page" | "slide" | "sheet";
}

export function PageOutlineMenu({ pages, unit = "page" }: PageOutlineMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    pages[0]?.id ?? null,
  );
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

  useEffect(() => {
    if (pages.length < 2) return;
    const targets: Element[] = [];
    for (const p of pages) {
      const el = document.getElementById(p.id);
      if (el) targets.push(el);
    }
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best) setActiveId(best.target.id);
      },
      { threshold: [0.5, 0.75, 1] },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [pages]);

  if (pages.length < 2) return null;

  const label = `${pages.length} ${unit}${pages.length === 1 ? "" : "s"}`;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Page outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`group inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 h-8
                   text-xs font-medium transition-colors
                   ${
                     open
                       ? "border-foreground/40 bg-muted text-foreground"
                       : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
                   }`}
      >
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden tabular-nums">{pages.length}</span>
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
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[220px] max-w-[320px] z-30
                     rounded-md border border-border bg-background shadow-lg
                     py-1 text-sm max-h-[60vh] overflow-y-auto
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {pages.map((p) => {
            const active = p.id === activeId;
            return (
              <a
                key={p.id}
                href={`#${p.id}`}
                onClick={() => setOpen(false)}
                className={`flex gap-2 px-3 py-1.5 transition-colors
                            ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              >
                <span
                  className={`tabular-nums w-5 text-right shrink-0 text-xs leading-5 ${active ? "text-accent" : "text-border"}`}
                >
                  {p.index}
                </span>
                <span className="truncate">{p.title}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
