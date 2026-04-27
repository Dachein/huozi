"use client";

/**
 * Share button rendered in the top-right of the fullscreen view, alongside
 * the close button. Click → opens the standard PublishDialog. Same flow as
 * the workspace inline FileActionsMenu's "Publish" entry, just lifted into
 * the fullscreen chrome so the user doesn't have to exit fullscreen first.
 */

import { useState } from "react";
import { ShareIcon } from "@heroicons/react/24/outline";
import { PublishDialog } from "./publish-dialog";

export interface ShareFullscreenButtonProps {
  path: string;
}

export function ShareFullscreenButton({ path }: ShareFullscreenButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share"
        title="Share"
        className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background/90 backdrop-blur text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <ShareIcon className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">Share</span>
      </button>
      <PublishDialog path={path} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
