"use client";

import type { ReactNode } from "react";
import { useFullscreen } from "./fullscreen-context";

export type FullscreenMode = "reader" | "raw" | "grid" | null;

const CLOSE_BUTTON_CLASS =
  "fixed top-3 right-3 z-[60] inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-background/90 backdrop-blur text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

export function FullscreenContent({
  mode,
  children,
}: {
  mode: FullscreenMode;
  children: ReactNode;
}) {
  const { fullscreen, setFullscreen } = useFullscreen();

  if (!mode || !fullscreen) return <>{children}</>;

  const closeButton = (
    <button
      type="button"
      onClick={() => setFullscreen(false)}
      aria-label="Exit fullscreen"
      title="Exit fullscreen (Esc)"
      className={CLOSE_BUTTON_CLASS}
    >
      <CollapseIcon />
    </button>
  );

  if (mode === "reader") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-auto">
        {closeButton}
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-12">{children}</div>
      </div>
    );
  }

  if (mode === "grid") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col p-4 sm:p-6">
        {closeButton}
        {children}
      </div>
    );
  }

  // raw — HTML controls its own layout, no padding so 100vh works.
  // The descendant-iframe overrides force the iframe (which has aspect-ratio
  // and fixed-height styling for the inline preview) to fill the viewport in
  // fullscreen mode.
  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-auto
                 [&_iframe]:!w-full [&_iframe]:!h-full
                 [&_iframe]:!max-w-none [&_iframe]:![aspect-ratio:auto]
                 [&_iframe]:!border-0 [&_iframe]:!rounded-none"
    >
      {closeButton}
      {children}
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M6 3 V6 H3 M10 6 V3 M10 6 H13 M13 10 H10 V13 M3 10 H6 V13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
