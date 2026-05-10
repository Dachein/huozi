"use client";

import type { ReactNode } from "react";
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";
import { useFullscreen } from "./fullscreen-context";
import { FullscreenPager } from "./fullscreen-pager";
import type { PageEntry } from "@/lib/html/extract-pages";
import {
  type HuoziFormat,
  pagerOrientationFor,
} from "@/lib/html/detect-format";

export type FullscreenMode = "reader" | "raw" | "grid" | null;

/**
 * @deprecated since 2026-05-10 — re-exported as a transitional alias for
 * `HuoziFormat`. New code should import `HuoziFormat` directly from
 * `@/lib/html/detect-format`. Kept here so existing call sites that
 * import `HtmlFormat` from this module keep compiling during migration.
 */
export type HtmlFormat = HuoziFormat;

const CLOSE_BUTTON_CLASS =
  "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-background/90 backdrop-blur text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

export function FullscreenContent({
  mode,
  children,
  pages = [],
  pageUnit = "page",
  htmlFormat = "web",
  alwaysOpen = false,
  chrome,
}: {
  mode: FullscreenMode;
  children: ReactNode;
  pages?: PageEntry[];
  pageUnit?: "page" | "slide" | "sheet";
  htmlFormat?: HuoziFormat;
  /** Skip the FullscreenProvider context check and always render the
   *  fullscreen wrapper. The publish surface uses this — the file IS the
   *  page, so there's no non-fullscreen state to fall back to. The close
   *  button is also suppressed in this mode (replaced by `chrome`, e.g.
   *  an "Open in Huozi" link). */
  alwaysOpen?: boolean;
  /** Extra chrome rendered in the top-right area. In normal (toggle)
   *  mode it sits to the LEFT of the close button (e.g. a Share button).
   *  In `alwaysOpen` mode it replaces the close button entirely. */
  chrome?: ReactNode;
}) {
  const { fullscreen, setFullscreen } = useFullscreen();
  const open = alwaysOpen || fullscreen;

  if (!mode || !open) return <>{children}</>;

  const closeButton = alwaysOpen ? null : (
    <button
      type="button"
      onClick={() => setFullscreen(false)}
      aria-label="Exit fullscreen"
      title="Exit fullscreen (Esc)"
      className={CLOSE_BUTTON_CLASS}
    >
      <ArrowsPointingInIcon className="w-4 h-4" aria-hidden="true" />
    </button>
  );

  // Pager rendered INSIDE the same fixed strip as chrome + close so they
  // never overlap, regardless of how wide the caller's chrome is. Order
  // (left → right): pager · chrome · close. Orientation is derived from
  // the format (deck = horizontal; story / paper = vertical) — the single
  // source of truth lives in `pagerOrientationFor`.
  const pagerOrientation = pagerOrientationFor(htmlFormat);
  const pagerInChrome =
    pages.length > 1 && pagerOrientation
      ? (
        <FullscreenPager
          pages={pages}
          unit={pageUnit}
          orientation={pagerOrientation}
          keyboardScope="global"
        />
      )
      : null;

  // Top-right chrome strip: pager + optional caller-supplied buttons + close.
  // top-4 right-4 = 16px breathing room from edges so the chrome doesn't
  // crowd the viewport corner.
  const topRight =
    pagerInChrome || chrome || closeButton ? (
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
        {pagerInChrome}
        {chrome}
        {closeButton}
      </div>
    ) : null;

  if (mode === "reader") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-auto">
        {topRight}
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-12">{children}</div>
      </div>
    );
  }

  if (mode === "grid") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col p-4 sm:p-6">
        {topRight}
        {children}
      </div>
    );
  }

  // raw — HTML controls its own layout, no padding so 100vh works.
  //
  // The .huozi-html-host wrapper from FileRenderer carries inline-preview
  // sizing hints (aspect-ratio, max-width, fixed height). We strip those in
  // every fullscreen mode so they don't confine the content. What we
  // FORCE on top depends on the format:
  //
  //   deck / story  — paginated viewport-pinned. The deck CSS uses 100vw /
  //                   100vh, so we lock host to the same with !w-screen
  //                   !h-screen. Container is overflow-hidden — snap-scroll
  //                   happens inside the deck's .slides element, never
  //                   outside. Any rounding overflow at the edge gets clipped.
  //
  //                   We also force `.huozi-story` / `.huozi-deck` to
  //                   `!h-screen`. Templates set `height:100vh` so this is a
  //                   no-op for them, but author-written decks that wrote
  //                   `min-height:100vh` (with `container-type:size` upstairs)
  //                   would otherwise resolve `100cqh` to 0 inside slides —
  //                   collapsing the entire deck to a blank page. Belt for
  //                   the suspenders the templates already wear.
  //
  //   paper / mobile / web / other — long-flow. The host is left at its
  //                   block-natural width (= container width minus scrollbar
  //                   gutter) so a vertical scrollbar doesn't push content
  //                   beyond viewport horizontally. Container overflow-auto
  //                   handles the vertical scroll. NEVER force w-screen here:
  //                   100vw includes the scrollbar gutter and produces a
  //                   spurious horizontal scrollbar.
  const isPaginated = htmlFormat === "deck" || htmlFormat === "story";
  const containerCls = isPaginated
    ? // Force-to-viewport sizing on the host; lock outer overflow.
      `overflow-hidden
       [&_.huozi-html-host]:!w-screen [&_.huozi-html-host]:!h-screen
       [&_.huozi-html-host]:!max-w-none [&_.huozi-html-host]:!max-h-none
       [&_.huozi-html-host]:![aspect-ratio:auto]
       [&_.huozi-html-host]:!overflow-visible
       [&_.huozi-html-host]:!m-0
       [&_.huozi-story]:!h-screen [&_.huozi-deck]:!h-screen`
    : // Long-flow: container scrolls vertically, host follows block width.
      // overflow-x-hidden is a belt-and-suspenders against any inner
      // element (or vw-based custom CSS) trying to overflow horizontally.
      `overflow-x-hidden overflow-y-auto
       [&_.huozi-html-host]:!w-full [&_.huozi-html-host]:!h-auto
       [&_.huozi-html-host]:!max-w-none [&_.huozi-html-host]:!max-h-none
       [&_.huozi-html-host]:![aspect-ratio:auto]
       [&_.huozi-html-host]:!overflow-visible
       [&_.huozi-html-host]:!m-0`;
  return (
    <div
      className={`fixed inset-0 z-50 bg-background ${containerCls}`}
      // Opt-in marker for the deck-only mobile-portrait auto-landscape CSS
      // baked into the deck template. Workspace inline preview never gets
      // this attribute, so its embed-sized 16:9 frame is preserved.
      {...(htmlFormat === "deck" ? { "data-huozi-rotate-portrait": "" } : {})}
    >
      {topRight}
      {children}
    </div>
  );
}

