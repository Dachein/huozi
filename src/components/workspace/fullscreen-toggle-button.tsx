"use client";

import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";
import { useFullscreen } from "./fullscreen-context";

export function FullscreenToggleButton({ enabled }: { enabled: boolean }) {
  const { fullscreen, toggle } = useFullscreen();

  if (!enabled) return null;

  const Icon = fullscreen ? ArrowsPointingInIcon : ArrowsPointingOutIcon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 h-8 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground transition-colors"
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span className="hidden sm:inline">Fullscreen</span>
    </button>
  );
}
