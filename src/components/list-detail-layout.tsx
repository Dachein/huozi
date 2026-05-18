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
  /** Detail pane content. `null` means nothing is selected (no pane shown). */
  detail: ReactNode | null;
  /** Dismiss handler — Esc, close button, and backdrop tap all call this. */
  onClose: () => void;
  /** Optional prev/next entity navigation. Buttons + ←/→ keys appear when set. */
  navigator?: ListDetailNavigator;
  /** Extra content rendered inside the detail chrome row (e.g. a small label). */
  detailHeader?: ReactNode;
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
  storageKey,
  defaultWidth = 400,
  minWidth = 320,
  maxWidth = 720,
}: ListDetailLayoutProps) {
  const open = detail !== null;

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
      // Handle sits on the LEFT edge of the detail pane, so moving the
      // pointer left widens the pane (and vice versa).
      const dx = state.startX - e.clientX;
      setWidth(clamp(state.startWidth + dx, minWidth, maxWidth));
    },
    [minWidth, maxWidth],
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
    if (!open) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth >= LG_BREAKPOINT) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose, navigator]);

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">{list}</div>

      {open && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize detail pane"
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
            className="hidden lg:flex shrink-0 flex-col min-h-0 border-l border-border/40 bg-background"
            style={{ width: `${width}px` }}
          >
            <DetailChrome
              navigator={navigator}
              onClose={onClose}
              extra={detailHeader}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">{detail}</div>
          </aside>
        </>
      )}

      {open && (
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
}: {
  navigator?: ListDetailNavigator;
  onClose: () => void;
  extra?: ReactNode;
}) {
  const showNav = !!(navigator?.goPrev || navigator?.goNext);
  return (
    <header className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 shrink-0">
      {showNav && (
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
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="esc"
        className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors"
      >
        ✕
      </button>
    </header>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
