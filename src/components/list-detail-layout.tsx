"use client";

/**
 * Generic list + detail scaffold. The "shell" half of the list+detail
 * pattern — see feedback: domains keep their own renderers, only the
 * chrome (layout, resize, prev/next, keyboard, mobile drawer) is shared.
 *
 * Layout:
 *   ≥ lg : list takes flex-1; detail sits in a right-side pane the user
 *          drags wider/narrower. Width persists per `storageKey` in
 *          localStorage so each surface (each jsonl file, mail, …) keeps
 *          its own preference.
 *   < lg : list always renders; selecting an item slides the detail
 *          in from the right as a full-screen drawer. Esc / backdrop
 *          tap / close button dismisses.
 *
 * Keyboard (only while a detail is open, and only when focus isn't in
 * an input/textarea/contentEditable):
 *   Esc   → onClose
 *   ←/→   → navigator.goPrev / goNext (when bound)
 *
 * This component owns no data and renders no list rows. Callers pass
 * `list` and `detail` as ReactNodes; the caller's `detail` is `null`
 * when nothing is selected.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface ListDetailNavigator {
  goPrev?: () => void;
  goNext?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}

export interface ListDetailLayoutProps {
  /** Always-visible list pane content. */
  list: ReactNode;
  /** Detail pane content. `null` means nothing is selected. */
  detail: ReactNode | null;
  /** Dismiss handler — Esc, close button, and backdrop tap all call this. */
  onClose: () => void;
  /** Optional prev/next entity navigation. Buttons + ←/→ keys appear when set. */
  navigator?: ListDetailNavigator;
  /** Extra content rendered inside the detail chrome row (e.g. a small label). */
  detailHeader?: ReactNode;
  /**
   * Email/Linear-style "always-on" layout. When true:
   *   - lg+ : list is a narrow left column, detail pane is always rendered
   *     on the right. When `detail` is null, `emptyDetail` shows in its place.
   *     No close button (you swap selections instead of closing).
   *   - < lg: behaves like the standard drawer pattern (detail only visible
   *     while an item is selected; full-screen drawer over the list).
   * Default false → click-to-open sidebar pattern.
   */
  defaultOpen?: boolean;
  /** Placeholder shown in the always-on pane when nothing is selected. */
  emptyDetail?: ReactNode;
  /**
   * Width strategy:
   *   - defaultOpen=false: drag-resizable right pane (320-720px)
   *   - defaultOpen=true:  fixed narrow LIST column (320px), detail takes the rest
   */
  /**
   * localStorage key for the desktop pane width. Use a path-shaped key so
   * different surfaces keep their own preferred widths
   * (e.g. `"jsonl.detail.width"`, `"mail.detail.width"`).
   */
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

// Matches tailwind `lg:` breakpoint. Below this, detail renders as a
// full-screen drawer instead of a side pane.
const LG_BREAKPOINT = 1024;

export function ListDetailLayout({
  list,
  detail,
  onClose,
  navigator,
  detailHeader,
  defaultOpen = false,
  emptyDetail,
  storageKey,
  defaultWidth = 400,
  minWidth = 320,
  maxWidth = 720,
}: ListDetailLayoutProps) {
  // Selection state — actual data presence.
  const hasSelection = detail !== null;
  // Desktop aside is visible iff we're in always-on mode OR something selected.
  // Mobile drawer is always tied to actual selection (no point showing an
  // empty full-screen drawer over the list).
  const asideVisible = defaultOpen || hasSelection;
  const mobileOpen = hasSelection;
  // In always-on mode the list column is fixed-width and the *detail*
  // takes the rest. In click-to-open mode the list grows, detail is fixed.
  const listColumnFixed = defaultOpen;

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (!Number.isFinite(parsed)) return defaultWidth;
    return clamp(parsed, minWidth, maxWidth);
  });

  // Debounced write so dragging doesn't hammer localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, String(width));
    }, 200);
    return () => window.clearTimeout(id);
  }, [storageKey, width]);

  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state) return;
      // The same `width` state means different things in each mode:
      //   click-to-open → detail width (handle on its left edge,
      //                                 drag left = wider)
      //   always-on     → list width   (handle on its right edge,
      //                                 drag right = wider)
      const delta = listColumnFixed
        ? e.clientX - state.startX
        : state.startX - e.clientX;
      setWidth(clamp(state.startWidth + delta, minWidth, maxWidth));
    },
    [minWidth, maxWidth, listColumnFixed],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragStateRef.current = null;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // Lock cursor + disable text selection on <html> while dragging so the
  // cursor stays col-resize even when the pointer leaves the handle.
  useEffect(() => {
    if (!dragging) return;
    const root = document.documentElement;
    const prevCursor = root.style.cursor;
    const prevUserSelect = root.style.userSelect;
    root.style.cursor = "col-resize";
    root.style.userSelect = "none";
    return () => {
      root.style.cursor = prevCursor;
      root.style.userSelect = prevUserSelect;
    };
  }, [dragging]);

  // Body-scroll lock for the mobile drawer only. Desktop split-view
  // doesn't need it.
  useEffect(() => {
    if (!mobileOpen) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth >= LG_BREAKPOINT) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Keyboard only active while there's a real selection — defaultOpen
  // alone shouldn't hijack ← → when the user is just browsing the list.
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "Escape" && !inField) {
        e.preventDefault();
        onClose();
        return;
      }
      if (inField) return;
      if (e.key === "ArrowLeft" && navigator?.canGoPrev && navigator.goPrev) {
        e.preventDefault();
        navigator.goPrev();
      } else if (
        e.key === "ArrowRight" &&
        navigator?.canGoNext &&
        navigator.goNext
      ) {
        e.preventDefault();
        navigator.goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSelection, onClose, navigator]);

  // Desktop column sizing:
  //   listColumnFixed (always-on)  → list = fixed `width` px, detail = flex-1
  //   click-to-open                → list = flex-1, detail = fixed `width` px
  // Same `width` state powers both modes; the storageKey naturally
  // separates "list width" vs "detail width" preferences across surfaces.
  const listStyle = listColumnFixed ? { width: `${width}px` } : undefined;
  const asideStyle = listColumnFixed ? undefined : { width: `${width}px` };

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div
        className={
          listColumnFixed
            ? "hidden lg:flex shrink-0 min-w-0 min-h-0 flex-col"
            : "flex-1 min-w-0 min-h-0 flex flex-col"
        }
        style={listStyle}
      >
        {list}
      </div>

      {/* On always-on mode below lg, the list takes the full screen and
          we still show it via a second copy (since the desktop list above
          is `hidden lg:flex`). Keeps the layout simple — one list source. */}
      {listColumnFixed && (
        <div className="lg:hidden flex-1 min-w-0 min-h-0 flex flex-col">
          {list}
        </div>
      )}

      {asideVisible && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`hidden lg:block shrink-0 w-1 cursor-col-resize border-l transition-colors ${
              dragging
                ? "border-foreground/60"
                : "border-border/40 hover:border-foreground/40"
            }`}
          />
          <aside
            className={`hidden lg:flex flex-col min-h-0 border-l border-border/40 bg-background ${
              listColumnFixed ? "flex-1 min-w-0" : "shrink-0"
            }`}
            style={asideStyle}
          >
            <DetailChrome
              navigator={navigator}
              onClose={onClose}
              extra={detailHeader}
              showClose={!defaultOpen}
              showWhenEmpty={defaultOpen && !hasSelection}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              {hasSelection ? detail : emptyDetail}
            </div>
          </aside>
        </>
      )}

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close detail"
            onClick={onClose}
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          />
          <aside
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 w-[92%] max-w-md bg-background border-l border-border shadow-xl flex flex-col"
          >
            <DetailChrome
              navigator={navigator}
              onClose={onClose}
              extra={detailHeader}
              showClose={true}
              showWhenEmpty={false}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">{detail}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

function DetailChrome({
  navigator,
  onClose,
  extra,
  showClose,
  showWhenEmpty,
}: {
  navigator?: ListDetailNavigator;
  onClose: () => void;
  extra?: ReactNode;
  /** Hide the ✕ button when the pane is always-on (no "closed" state). */
  showClose: boolean;
  /** Render the chrome row even when nothing is selected (always-on mode). */
  showWhenEmpty: boolean;
}) {
  const hasNav = !!(navigator?.goPrev || navigator?.goNext);
  // When always-on with no selection, render an empty chrome row to
  // keep vertical alignment with the list pane's header.
  if (showWhenEmpty && !hasNav && !extra && !showClose) {
    return (
      <header className="border-b border-border/40 shrink-0 h-[34px]" />
    );
  }
  return (
    <header className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 shrink-0">
      {hasNav && (
        <>
          <button
            type="button"
            onClick={navigator?.goPrev}
            disabled={!navigator?.canGoPrev}
            aria-label="Previous"
            title="←"
            className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ←
          </button>
          <button
            type="button"
            onClick={navigator?.goNext}
            disabled={!navigator?.canGoNext}
            aria-label="Next"
            title="→"
            className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            →
          </button>
        </>
      )}
      <div className="flex-1 min-w-0 px-2 text-xs text-muted-foreground truncate">
        {extra}
      </div>
      {showClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="esc"
          className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          ✕
        </button>
      )}
    </header>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
