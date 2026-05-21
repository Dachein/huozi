"use client";

/**
 * Slide-in side drawer used by the workspace's "settings-like" pages
 * (Folder Settings, Mail Settings, Members, Shares, Projects). Each
 * page still owns its own route — deep links still work — but the
 * content renders inside this drawer over a backdrop, with the
 * workspace shell continuing to live behind it.
 *
 * Close behavior:
 *   - ESC key
 *   - click on backdrop
 *   - explicit "✕" button
 *
 * All three roads back trigger router.back() when there's history to
 * pop, otherwise route to /workspace as a safe fallback (handles the
 * "user opens drawer URL directly in a new tab" case).
 *
 * The drawer is intentionally a CSS-only panel — no animation library —
 * so it stays fast and has zero JS overhead beyond the close handlers.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type SideDrawerSize = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<SideDrawerSize, string> = {
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export interface SideDrawerProps {
  title?: string;
  /** Where to land when the drawer is closed without history. Default: `/workspace`. */
  closeFallback?: string;
  /** Panel width. Default `md` (max-w-xl). Use `xl` for table-shaped content like Shares. */
  size?: SideDrawerSize;
  children: React.ReactNode;
}

export function SideDrawer({
  title,
  closeFallback = "/workspace",
  size = "md",
  children,
}: SideDrawerProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    // Try going back first; if there's no history (direct deep link
    // or new tab), fall back to the workspace home so the user isn't
    // stranded on a backdrop with no nav.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(closeFallback);
    }
  };

  // ESC to close + focus management — focus the drawer panel so screen
  // readers announce its content and Tab cycles inside it (not the
  // backdrop'd content underneath).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Drawer"}
    >
      {/* Backdrop — click anywhere outside the panel to close. */}
      <button
        type="button"
        aria-label="Close drawer"
        className="flex-1 bg-foreground/30 backdrop-blur-sm cursor-default"
        onClick={close}
      />

      {/* Panel — fixed width on desktop, full width on mobile. */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`w-full ${SIZE_CLASSES[size]} flex-shrink-0 bg-background border-l border-border shadow-2xl overflow-y-auto outline-none`}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-6 py-3">
          <h2 className="text-sm font-medium text-foreground/90 truncate">
            {title ?? ""}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="size-7 rounded inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </header>
        <div className="px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}
