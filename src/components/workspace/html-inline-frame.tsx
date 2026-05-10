"use client";

/**
 * Wrapper around an inline-preview HTML render, adding a floating
 * FullscreenPager in the top-right corner for paginated formats
 * (deck / story / paper).
 *
 * Why this exists: server-side `FileRenderer` outputs the prerendered
 * HTML inside a `.huozi-html-host` div with format-specific aspect-ratio
 * sizing. We want a compact prev/next pager + keyboard nav inside the
 * preview box, but the pager is a client component (uses
 * IntersectionObserver) and FileRenderer is async/server. This frame
 * sits between them — server-side parent passes the prerendered HTML
 * + page list, this client wrapper composes them with the pager.
 *
 * Operation parity with publish + workspace fullscreen: same
 * FullscreenPager component, same orientation derivation, same
 * scrollIntoView mechanism. The only difference is `keyboardScope`:
 * inline uses "container" so arrow keys only fire when the preview
 * has hover/focus — otherwise the pager would steal arrows from the
 * surrounding workspace UI (file tree, breadcrumb, etc.).
 *
 * Spec: docs/share-viewer-norms (workspace inline surface).
 */

import { useRef, type CSSProperties } from "react";
import {
  type HuoziFormat,
  pagerOrientationFor,
} from "@/lib/html/detect-format";
import type { PageEntry } from "@/lib/html/extract-pages";
import { FullscreenPager } from "./fullscreen-pager";

export interface HtmlInlineFrameProps {
  /** Sanitized + scoped HTML from `processHtmlDirect`. Goes through
   *  `dangerouslySetInnerHTML` — caller is responsible for trust. */
  html: string;
  /** Wrapper className (sizing overrides like `[&_.huozi-deck]:!w-full`).
   *  Concatenated with `huozi-html-host block`. */
  hostClassName: string;
  /** Inline style (aspect-ratio, max-width, max-height, etc.). */
  hostStyle: CSSProperties;
  /** Detected huozi:format. Drives pager visibility + orientation. */
  format: HuoziFormat;
  /** Extracted page list. Empty / single-page → no pager. */
  pages: PageEntry[];
  /** Singular noun for the indicator. "page" / "slide" / "sheet". */
  pageUnit?: "page" | "slide" | "sheet";
}

export function HtmlInlineFrame({
  html,
  hostClassName,
  hostStyle,
  format,
  pages,
  pageUnit = "page",
}: HtmlInlineFrameProps) {
  // The container ref doubles as the keyboard-scope sentinel: pager arrow
  // shortcuts only fire while pointer hover or DOM focus lives inside it.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const orientation = pagerOrientationFor(format);
  const showPager = orientation !== null && pages.length > 1;

  // Outer wrapper: makes the absolute-positioned pager anchor relative to
  // the preview box (same dimensions as the host wrapper). `tabIndex={-1}`
  // lets it receive focus when the user clicks inside the preview, so
  // keyboard activation kicks in without requiring hover.
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative outline-none"
      style={{ width: "100%" }}
    >
      {showPager ? (
        <div className="absolute top-2 right-2 z-10">
          <FullscreenPager
            pages={pages}
            unit={pageUnit}
            orientation={orientation}
            keyboardScope="container"
            containerRef={containerRef}
          />
        </div>
      ) : null}
      <div
        className={`huozi-html-host block ${hostClassName}`}
        style={hostStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
