"use client";

import { useFullscreen } from "./fullscreen-context";

export function FullscreenToggleButton({ enabled }: { enabled: boolean }) {
  const { fullscreen, toggle } = useFullscreen();

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 h-8 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground transition-colors"
    >
      <ExpandIcon />
      <span className="hidden sm:inline">Fullscreen</span>
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M3 6 V3 H6 M10 3 H13 V6 M13 10 V13 H10 M6 13 H3 V10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
