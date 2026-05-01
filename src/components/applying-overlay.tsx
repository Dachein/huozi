"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/context";

export interface ApplyingOverlayProps {
  /** Resolved display name of the target the user is switching to —
   *  theme name (translated) or locale native name (same in every UI
   *  language). The overlay does no translation itself; the caller
   *  passes the final string. */
  target: string;
}

/** Full-screen overlay shown for ~250ms between cookie write and the
 *  hard reload that locale/theme switches trigger. Renders in the
 *  OUTGOING surface (the page hasn't reloaded yet) so it visually
 *  covers the transition rather than pretending to be in the new one.
 *
 *  Portaled to <body> because the AppHeader uses `backdrop-blur`,
 *  which would otherwise scope our `fixed` positioning to the header
 *  box and clip the overlay. */
export function ApplyingOverlay({ target }: ApplyingOverlayProps) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm
                 flex items-center justify-center pointer-events-none
                 animate-in fade-in duration-150"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-1 w-32 overflow-hidden bg-border/40">
          <div className="h-full w-full bg-accent animate-loading-bar" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {t("theme.applying")}{" "}
          <span className="text-foreground">{target}</span>
        </span>
      </div>
    </div>,
    document.body,
  );
}

/** Delay between writing the cookie and `window.location.reload()`.
 *
 *  Why a delay: a synchronous reload after `setState` cancels the
 *  React commit before the overlay paints. 250ms is above the
 *  threshold of perception (~100ms) so the user actually sees the
 *  overlay, but short enough that the switch still feels immediate. */
export const APPLY_DELAY_MS = 250;
