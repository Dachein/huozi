"use client";

/**
 * Pager chrome shown in the top-right of the fullscreen raw HTML view.
 *
 *   ◀ 3 / 6 ▶
 *
 * Scope: deck / story / paper (any HTML with [data-page] markers). Hidden
 * when pages.length < 2 — the chrome is meaningless on a single-page doc.
 *
 * Active page tracking mirrors PageOutlineMenu (same IntersectionObserver
 * threshold-based "best intersection wins" approach), so the indicator and
 * the dropdown stay in sync without coordinating state.
 *
 * Keyboard:
 *   ← / ↑   previous page
 *   → / ↓   next page
 * Arrow handlers ignore inputs and contenteditable so they don't fight with
 * future text fields. Esc is owned by the fullscreen close handler upstream.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import type { PageEntry } from "@/lib/html/extract-pages";

export interface FullscreenPagerProps {
  pages: PageEntry[];
  /** Singular noun for the indicator. "page" / "slide". */
  unit?: "page" | "slide" | "sheet";
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

export function FullscreenPager({ pages, unit = "page" }: FullscreenPagerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = activeIndex;

  // Track which slide / page currently dominates the viewport.
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
      const next = activeRef.current + delta;
      if (next < 0 || next >= pages.length) return;
      const target = pages[next];
      if (!target) return;
      setActiveIndex(next);
      scrollToPage(target.id);
    },
    [pages],
  );

  // Global arrow-key navigation. ← ↑ = prev, → ↓ = next.
  useEffect(() => {
    if (pages.length < 2) return;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goto(-1);
      } else if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === " "
      ) {
        e.preventDefault();
        goto(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goto, pages.length]);

  if (pages.length < 2) return null;

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= pages.length - 1;
  const current = activeIndex + 1;

  return (
    <div
      className="inline-flex items-center gap-1 h-8
                 rounded-md border border-border bg-background/90 backdrop-blur
                 px-1 text-xs text-muted-foreground"
      role="navigation"
      aria-label={`${unit} pager`}
    >
      <button
        type="button"
        onClick={() => goto(-1)}
        disabled={atStart}
        aria-label={`Previous ${unit}`}
        title="Previous (←)"
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm
                   hover:bg-muted hover:text-foreground transition-colors
                   disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <ChevronLeftIcon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <span className="px-1 tabular-nums select-none">
        <span className="text-foreground">{current}</span>
        <span className="opacity-50"> / {pages.length}</span>
      </span>
      <button
        type="button"
        onClick={() => goto(1)}
        disabled={atEnd}
        aria-label={`Next ${unit}`}
        title="Next (→)"
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm
                   hover:bg-muted hover:text-foreground transition-colors
                   disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <ChevronRightIcon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
