"use client";

/**
 * Pager chrome shown in the top-right of the raw HTML view.
 *
 * Horizontal (deck):    ◀ 3 / 6 ▶
 * Vertical (story / paper):
 *                       ▲
 *                     3 / 6
 *                       ▼   (rendered inline, same compact strip)
 *
 * Scope: deck / story / paper (any HTML with [data-page] markers). Hidden
 * when pages.length < 2 — the chrome is meaningless on a single-page doc.
 *
 * Active page tracking mirrors PageOutlineMenu (same IntersectionObserver
 * threshold-based "best intersection wins" approach), so the indicator and
 * the dropdown stay in sync without coordinating state.
 *
 * Keyboard (axis-strict, see Spec §3.2):
 *   horizontal:  ←       prev   ·  →  / Space         next
 *   vertical:    ↑ / PgUp prev  ·  ↓  / Space / PgDn  next
 * Inputs and contenteditable are ignored so author forms don't fight the
 * pager. Esc is owned by the fullscreen close handler upstream.
 *
 * keyboardScope:
 *   "global"    — listen on window. Use for fullscreen / publish surfaces
 *                 where the deck IS the page.
 *   "container" — listen via the returned `ref`'s closest preview wrapper;
 *                 only fire when that wrapper has hover/focus. Use for
 *                 workspace inline preview so the pager doesn't steal
 *                 arrow keys from the surrounding workspace UI.
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

export interface FullscreenPagerProps {
  pages: PageEntry[];
  /** Singular noun for the indicator. "page" / "slide". */
  unit?: "page" | "slide" | "sheet";
  /** Pager axis. Derived from `pagerOrientationFor(format)` upstream. */
  orientation: PagerOrientation;
  /**
   * Where the keyboard listener attaches.
   *   "global"    — window (default for fullscreen / publish)
   *   "container" — only fires when the supplied container has hover/focus
   *                 (workspace inline preview to avoid stealing arrows
   *                 from the surrounding UI)
   * Defaults to "global" to preserve pre-2026-05-10 behavior.
   */
  keyboardScope?: "global" | "container";
  /**
   * Required when `keyboardScope === "container"`. The pager listens for
   * arrow keys only while pointer hover or DOM focus lives inside this
   * element. Ignored in "global" mode.
   */
  containerRef?: React.RefObject<HTMLElement | null>;
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

export function FullscreenPager({
  pages,
  unit = "page",
  orientation,
  keyboardScope = "global",
  containerRef,
}: FullscreenPagerProps) {
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

  // Axis-strict arrow-key navigation. Spec §3.2 — deck (horizontal) only
  // responds to ← / →, story+paper (vertical) only to ↑ / ↓ + PgUp/PgDn.
  // Space is "next" on both axes (universal "next" convention from slide
  // decks). Container scope lets workspace inline preview opt into pager
  // shortcuts only while focused, so arrow keys don't fight workspace UI.
  useEffect(() => {
    if (pages.length < 2) return;
    const horiz = orientation === "horizontal";
    const prevKeys = horiz
      ? new Set(["ArrowLeft"])
      : new Set(["ArrowUp", "PageUp"]);
    const nextKeys = horiz
      ? new Set(["ArrowRight", " "])
      : new Set(["ArrowDown", "PageDown", " "]);

    let isActive = keyboardScope === "global";
    // Capture the container element once; using `containerRef.current` in
    // the cleanup function would read whatever the ref points at *then*,
    // which may differ from setup-time if the wrapper was unmounted.
    const containerEl =
      keyboardScope === "container" ? (containerRef?.current ?? null) : null;
    if (keyboardScope === "container" && !containerEl) return;
    const onEnter = () => {
      isActive = true;
    };
    const onLeave = () => {
      isActive = false;
    };

    if (containerEl) {
      containerEl.addEventListener("mouseenter", onEnter);
      containerEl.addEventListener("mouseleave", onLeave);
      containerEl.addEventListener("focusin", onEnter);
      containerEl.addEventListener("focusout", onLeave);
    }

    function onKey(e: KeyboardEvent) {
      if (!isActive) return;
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
    return () => {
      window.removeEventListener("keydown", onKey);
      if (containerEl) {
        containerEl.removeEventListener("mouseenter", onEnter);
        containerEl.removeEventListener("mouseleave", onLeave);
        containerEl.removeEventListener("focusin", onEnter);
        containerEl.removeEventListener("focusout", onLeave);
      }
    };
  }, [goto, pages.length, orientation, keyboardScope, containerRef]);

  if (pages.length < 2) return null;

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= pages.length - 1;
  const current = activeIndex + 1;

  const horiz = orientation === "horizontal";
  const PrevIcon = horiz ? ChevronLeftIcon : ChevronUpIcon;
  const NextIcon = horiz ? ChevronRightIcon : ChevronDownIcon;
  const prevHint = horiz ? "Previous (←)" : "Previous (↑)";
  const nextHint = horiz ? "Next (→)" : "Next (↓)";

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
        title={prevHint}
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm
                   hover:bg-muted hover:text-foreground transition-colors
                   disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <PrevIcon className="w-3.5 h-3.5" aria-hidden="true" />
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
        title={nextHint}
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm
                   hover:bg-muted hover:text-foreground transition-colors
                   disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <NextIcon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
