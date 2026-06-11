"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowsPointingInIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";
import { useFullscreen } from "./fullscreen-context";
import { PageOutlineMenu } from "./page-outline-menu";
import type { PageEntry } from "@/lib/html/extract-pages";
import {
  type HuoziFormat,
  pagerOrientationFor,
} from "@/lib/html/detect-format";

export type FullscreenMode = "reader" | "raw" | "grid" | null;

const CLOSE_BUTTON_CLASS =
  "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-background/90 backdrop-blur text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

export function FullscreenContent({
  mode,
  children,
  pages = [],
  pageUnit = "page",
  htmlFormat = "blog",
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
  const canToggleLandscape =
    htmlFormat === "deck" || htmlFormat === "dashboard";
  const [landscapeActive, setLandscapeActive] = useState(false);
  const landscapeEnabled = canToggleLandscape && landscapeActive;

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

  // Unified nav widget (prev · "N slides ▾" · next) rendered INSIDE the same
  // fixed strip as chrome + close so they never overlap. Order (left → right):
  // outline-menu · chrome · close. Orientation is derived from the format
  // (deck = horizontal; story / paper = vertical) — the single source of
  // truth lives in `pagerOrientationFor`.
  const pagerOrientation = pagerOrientationFor(htmlFormat);
  const pagerInChrome =
    pages.length > 1
      ? (
        <PageOutlineMenu
          pages={pages}
          unit={pageUnit}
          orientation={pagerOrientation}
        />
      )
      : null;
  const landscapeToggle = canToggleLandscape ? (
    <button
      type="button"
      onClick={() => setLandscapeActive((v) => !v)}
      aria-pressed={landscapeEnabled}
      aria-label={landscapeEnabled ? "Switch to portrait" : "Switch to landscape"}
      title={landscapeEnabled ? "竖屏预览" : "横屏预览"}
      className="huozi-mobile-landscape-toggle md:hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-background/90 backdrop-blur text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <DevicePhoneMobileIcon
        className={`w-4 h-4 transition-transform ${landscapeEnabled ? "rotate-90" : ""}`}
        aria-hidden="true"
      />
    </button>
  ) : null;

  // Top-right chrome strip: pager + optional caller-supplied buttons + close.
  // top-4 right-4 = 16px breathing room from edges so the chrome doesn't
  // crowd the viewport corner.
  // `huozi-fullscreen-chrome` is a hook for sibling overlays (the
  // Clippings drawer in particular) to shove this strip out of their
  // way via CSS. See globals.css §"Clippings drawer collision avoidance".
  const topRight =
    pagerInChrome || landscapeToggle || chrome || closeButton ? (
      <div className="huozi-fullscreen-chrome fixed top-4 right-4 z-[60] flex items-center gap-2">
        {pagerInChrome}
        {landscapeToggle}
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
  // Three sizing regimes:
  //
  //   deck / story   — viewport-pinned, paginated. Force `.huozi-html-host`
  //                    to 100vw × 100vh and drop the inline aspect-ratio
  //                    so paginated content fills the screen.
  //
  //   dashboard      — viewport-pinned, but the OUTER `.huozi-dashboard-
  //                    surface` carries the aspect-ratio (inline preview)
  //                    while the inner host takes `flex-1`. In fullscreen
  //                    we only need to drop that outer aspect-ratio so the
  //                    surface fills `h-full` (= 100vh) cleanly; TabBar +
  //                    host flex layout handles the rest. NEVER force
  //                    `!h-screen` on the host here — that would push the
  //                    bottom of the host below the viewport by the
  //                    TabBar's height.
  //
  //   paper / mobile / web — long-flow. Host follows block width, container
  //                    scrolls vertically.
  // Canvas formats (story / deck / dashboard / paper) are wrapped in a
  // `.huozi-canvas-outer` by file-renderer / share-viewer — that outer
  // carries the inline-preview aspect-ratio + max-width. In fullscreen
  // we strip those constraints so the outer fills the viewport; the
  // inner Stage (ScaledStage for scale, FixedWidthStage for paper)
  // takes care of the rest (transform for scaled, centered scroll for
  // paper). No more `.huozi-html-host !w-screen !h-screen` overrides —
  // those broke container-query semantics by forcing the host away
  // from canvas dims.
  //
  // Long-flow formats (mobile / web) keep the legacy host-based
  // overrides since they don't have a canvas-outer wrapper.
  const isPaper = htmlFormat === "paper";
  const isCanvas =
    htmlFormat === "deck" ||
    htmlFormat === "story" ||
    htmlFormat === "dashboard" ||
    htmlFormat === "app";
  const canvasOuterSizeCls = landscapeEnabled
    ? "[&_.huozi-canvas-outer]:!w-full [&_.huozi-canvas-outer]:!h-full"
    : "[&_.huozi-canvas-outer]:!w-screen [&_.huozi-canvas-outer]:!h-screen";
  const containerCls = isPaper
    ? `overflow-x-hidden overflow-y-auto
       [&_.huozi-canvas-outer]:!w-full [&_.huozi-canvas-outer]:!h-auto
       [&_.huozi-canvas-outer]:!min-h-screen
       [&_.huozi-canvas-outer]:!max-w-none [&_.huozi-canvas-outer]:!max-h-none
       [&_.huozi-canvas-outer]:![aspect-ratio:auto]
       [&_.huozi-canvas-outer]:!m-0
       [&_.huozi-paper-frame]:!h-auto [&_.huozi-paper-frame]:!min-h-screen
       [&_.huozi-paper-frame]:!overflow-visible`
    : isCanvas
    ? `overflow-hidden
       ${canvasOuterSizeCls}
       [&_.huozi-canvas-outer]:!max-w-none [&_.huozi-canvas-outer]:!max-h-none
       [&_.huozi-canvas-outer]:![aspect-ratio:auto]
       [&_.huozi-canvas-outer]:!m-0`
    : // Long-flow: container scrolls vertically, host follows block width.
      // overflow-x-hidden is a belt-and-suspenders against any inner
      // element (or vw-based custom CSS) trying to overflow horizontally.
      `overflow-x-hidden overflow-y-auto
       [&_.huozi-html-host]:!w-full
       [&_.huozi-html-host]:!max-w-none [&_.huozi-html-host]:!max-h-none
       [&_.huozi-html-host]:![aspect-ratio:auto]
       [&_.huozi-html-host]:!overflow-visible
       [&_.huozi-html-host]:!m-0`;
  // Share view (alwaysOpen): the wrapper is an overlay (fixed inset-0
  // z-50) that covers the document body. Painting it with bg-background
  // (cream) erases whatever the file's <style> declared on html/body —
  // the sanitizer injects e.g. `html, body { background: #0b0d12 }` for
  // a dark dashboard, and that has to be visible. Use bg-transparent so
  // the wrapper passes through to the body, which carries either the
  // file's bg (dark dashboard / themed canvas) or the layout bg-background
  // fallback (markdown blog with no body paint). Workspace fullscreen
  // keeps bg-background so the explicit "close to enter workspace" stage
  // still reads as part of the app shell, not as a publish surface.
  const wrapperBg = alwaysOpen ? "bg-transparent" : "bg-background";
  return (
    <div
      className={`fixed inset-0 z-50 ${wrapperBg} ${containerCls}`}
      // Mobile portrait opens as a normal portrait preview. The user can
      // explicitly enter a rotated landscape preview for wide canvases.
      {...(canToggleLandscape
        ? { "data-huozi-landscape-capable": htmlFormat }
        : {})}
      {...(landscapeEnabled ? { "data-huozi-landscape-active": "" } : {})}
    >
      {topRight}
      {children}
    </div>
  );
}
