"use client";

/**
 * Unified page-navigation widget: prev arrow · "N slides ▾" dropdown · next
 * arrow. Used as the single nav surface in both the workspace inline header
 * and the fullscreen / publish top-right chrome strip.
 *
 * Replaces the older split (FullscreenPager floating inside the preview box +
 * PageOutlineMenu dropdown in the header). One widget = one source of truth
 * for "where am I in the deck/story". The dropdown is the same as before;
 * the arrows mirror the keyboard nav and stay in sync via the same
 * IntersectionObserver that drives the dropdown highlight.
 *
 * Orientation:
 *   - horizontal (deck)        — ← / →, arrows render as chevron-left/right
 *   - vertical   (story/paper) — ↑ / ↓, arrows render as chevron-up/down
 *   - null                     — no arrows, just the dropdown (legacy fallback)
 *
 * Keyboard nav is axis-strict (deck only responds to ← →, story+paper only
 * to ↑ ↓ + PgUp/PgDn). Space = next on both axes. Listeners attach to window
 * unconditionally — closing on click-outside still works for the dropdown.
 *
 * Closes on click-outside + Escape, mirroring FileActionsMenu.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import type { PageEntry } from "@/lib/html/extract-pages";
import type { PagerOrientation } from "@/lib/html/detect-format";

export interface PageOutlineMenuProps {
  pages: PageEntry[];
  /** Singular noun for the dropdown label. "page" / "slide" / "sheet". */
  unit?: "page" | "slide" | "sheet";
  /** Pager axis. `null` / omitted hides the arrows; pass an orientation
   *  to enable prev/next + axis-strict keyboard nav. */
  orientation?: PagerOrientation | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function scrollToPage(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start", inline: "start" });
}

export function PageOutlineMenu({
  pages,
  unit = "page",
  orientation,
}: PageOutlineMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
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
    const targets: HTMLElement[] = [];
    const idToIdx = new Map<string, number>();
    pages.forEach((p, i) => {
      const el = document.getElementById(p.id);
      if (el) {
        targets.push(el);
        idToIdx.set(p.id, i);
      }
    });
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best) {
          const idx = idToIdx.get((best.target as HTMLElement).id);
          if (idx !== undefined) setActiveIndex(idx);
        }
      },
      { threshold: [0.5, 0.75, 1] },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [pages]);

  const goto = useCallback(
    (delta: -1 | 1) => {
      setActiveIndex((curr) => {
        const next = curr + delta;
        if (next < 0 || next >= pages.length) return curr;
        const target = pages[next];
        if (!target) return curr;
        scrollToPage(target.id);
        return next;
      });
    },
    [pages],
  );

  useEffect(() => {
    if (!orientation || pages.length < 2) return;
    const horiz = orientation === "horizontal";
    const prevKeys = horiz
      ? new Set(["ArrowLeft"])
      : new Set(["ArrowUp", "PageUp"]);
    const nextKeys = horiz
      ? new Set(["ArrowRight", " "])
      : new Set(["ArrowDown", "PageDown", " "]);
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (prevKeys.has(e.key)) {
        e.preventDefault();
        goto(-1);
      } else if (nextKeys.has(e.key)) {
        e.preventDefault();
        goto(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goto, pages.length, orientation]);

  if (pages.length < 2) return null;

  const label = `${pages.length} ${unit}${pages.length === 1 ? "" : "s"}`;
  const activeId = pages[activeIndex]?.id ?? null;
  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= pages.length - 1;
  const horiz = orientation === "horizontal";
  const PrevIcon = horiz ? ChevronLeftIcon : ChevronUpIcon;
  const NextIcon = horiz ? ChevronRightIcon : ChevronDownIcon;
  const prevHint = horiz ? "Previous (←)" : "Previous (↑)";
  const nextHint = horiz ? "Next (→)" : "Next (↓)";

  const arrowBtnCls =
    "inline-flex items-center justify-center w-6 h-6 rounded-sm " +
    "hover:bg-muted hover:text-foreground transition-colors " +
    "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

  return (
    <div
      ref={rootRef}
      className="relative inline-flex items-center gap-0.5 h-8 rounded-md border border-border bg-background/90 backdrop-blur px-1 text-xs text-muted-foreground"
      role="navigation"
      aria-label={`${unit} navigation`}
    >
      {orientation ? (
        <button
          type="button"
          onClick={() => goto(-1)}
          disabled={atStart}
          aria-label={`Previous ${unit}`}
          title={prevHint}
          className={arrowBtnCls}
        >
          <PrevIcon className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Page outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 h-7 rounded-sm text-xs font-medium transition-colors
                   ${
                     open
                       ? "bg-muted text-foreground"
                       : "hover:bg-muted/60 hover:text-foreground"
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
      {orientation ? (
        <button
          type="button"
          onClick={() => goto(1)}
          disabled={atEnd}
          aria-label={`Next ${unit}`}
          title={nextHint}
          className={arrowBtnCls}
        >
          <NextIcon className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[220px] max-w-[320px] z-30
                     rounded-md border border-border bg-background shadow-lg
                     py-1 text-sm max-h-[60vh] overflow-y-auto
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {pages.map((p, i) => {
            const active = p.id === activeId;
            return (
              <a
                key={p.id}
                href={`#${p.id}`}
                onClick={() => {
                  setOpen(false);
                  setActiveIndex(i);
                }}
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
