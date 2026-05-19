"use client";

/**
 * Wrapper around an inline-preview HTML render.
 *
 * Why this exists: server-side `FileRenderer` outputs the prerendered HTML
 * inside a `.huozi-html-host` div with format-specific aspect-ratio sizing.
 * This client frame composes that markup with one thin client-side concern:
 *
 *   Mobile-portrait auto-fullscreen for deck — without this, a 16:9 deck
 *   compresses into a phone-width strip ~50px tall, illegible. We enter
 *   fullscreen on mount so the fullscreen wrapper's existing
 *   `data-huozi-rotate-portrait` chain takes over (rotates the deck 90°
 *   to landscape, fills the screen). Other formats stay in inline preview
 *   as before. Triggered only on the very first paint of a deck on
 *   mobile portrait; user can Esc / close-button out into the inline view
 *   if they prefer the strip.
 *
 * Navigation chrome (prev/next + outline dropdown) lives in the file header
 * (`PageOutlineMenu`), not here. The older floating pager was removed when
 * the outline menu absorbed prev/next arrows.
 *
 * Spec: docs/share-viewer-norms (workspace inline surface).
 */

import { useEffect, type CSSProperties } from "react";
import { type HuoziFormat } from "@/lib/html/detect-format";
import type { PageEntry } from "@/lib/html/extract-pages";
import { useFullscreen } from "./fullscreen-context";

export interface HtmlInlineFrameProps {
  /** Sanitized + scoped HTML from `processHtmlDirect`. Goes through
   *  `dangerouslySetInnerHTML` — caller is responsible for trust. */
  html: string;
  /** Wrapper className (sizing overrides like `[&_.huozi-deck]:!w-full`).
   *  Concatenated with `huozi-html-host block`. */
  hostClassName: string;
  /** Inline style (aspect-ratio, max-width, max-height, etc.). */
  hostStyle: CSSProperties;
  /** Detected huozi:format. Drives mobile-portrait auto-fullscreen for deck. */
  format: HuoziFormat;
  /** Extracted page list. Currently unused by the frame itself (the header's
   *  PageOutlineMenu reads it) but kept on the prop surface so callers don't
   *  need to know whether the chrome lives here or upstairs. */
  pages: PageEntry[];
  /** Singular noun for the indicator. Same plumbing reason as `pages`. */
  pageUnit?: "page" | "slide" | "sheet";
}

function isMobilePortrait(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width:767px) and (orientation:portrait)").matches
  );
}

export function HtmlInlineFrame({
  html,
  hostClassName,
  hostStyle,
  format,
}: HtmlInlineFrameProps) {
  const { setFullscreen } = useFullscreen();

  // Mobile-portrait + deck → auto-enter fullscreen on mount. The fullscreen
  // wrapper already sets `data-huozi-rotate-portrait`, so the deck rotates
  // landscape and fills the screen. The Esc / close button lets the user
  // exit if they want the inline view back. No-op on tablet/desktop and on
  // non-deck formats — those render at their natural inline size.
  useEffect(() => {
    if (format !== "deck") return;
    if (!isMobilePortrait()) return;
    setFullscreen(true);
  }, [format, setFullscreen]);

  // No rotation opt-in on the inline host: leaving it off means dismissing
  // the auto-fullscreen on mobile drops back into a small 16:9 strip rather
  // than a rotated deck that has overflowed the embed. The fullscreen wrapper
  // owns the rotation, not the inline frame.
  return (
    <div
      className={`huozi-html-host block ${hostClassName}`}
      style={hostStyle}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
