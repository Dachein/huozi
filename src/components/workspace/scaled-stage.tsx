/**
 * Pure-CSS scaling wrapper for fixed-canvas HTML formats (story / deck /
 * dashboard).
 *
 * Renders the inner stage at the author-declared canvas pixel size and
 * uses `transform: scale(min(100cqw / W, 100cqh / H))` to fit the
 * surrounding display area while preserving aspect ratio. The scale is
 * computed entirely by the browser via CSS container queries — no
 * JavaScript, no ResizeObserver, no React state. This is a *server*
 * component; its rendered HTML is the final shape, with zero hydration
 * differences from initial paint.
 *
 * Why pure CSS:
 *   The earlier ResizeObserver + useState implementation passed JSX
 *   children (including the file's prerendered HTML string) across a
 *   "use client" boundary. In Next.js 16 RSC + React 19 streaming SSR
 *   this combination hung the Suspense resolution in production. The
 *   pure-CSS approach has no client boundary, no observer, no state —
 *   the bug surface is dramatically smaller.
 *
 * Why container queries work here:
 *   The outer wrapper carries `container-type: size`, exposing its
 *   resolved pixel dimensions to descendants via `100cqw` / `100cqh`.
 *   The inner stage's `transform: scale(...)` reads those units to
 *   compute the fit factor. When the wrapper resizes (window resize,
 *   panel toggle, fullscreen toggle), `cqw/cqh` re-evaluates and the
 *   scale updates — handled natively by the browser, no JS roundtrip.
 *
 * Container query nesting:
 *   This wrapper opens a container ("canvas-frame"). Inside the stage,
 *   the file's own `.huozi-story` / `.huozi-deck` typically declares
 *   its own `container-type: size`, opening a nested container that
 *   shadows ours. Author CSS `4cqw` inside `.huozi-story` therefore
 *   resolves to the *story's* layout width (= our canvas width, since
 *   the stage forces it via `!w-full`), NOT the outer wrapper's. This
 *   is the desired behavior: typography stays consistent regardless of
 *   how big the outer display area is.
 */

import type { CSSProperties, ReactNode } from "react";

export interface ScaledStageProps {
  /** Author-declared canvas width in CSS pixels. */
  width: number;
  /** Author-declared canvas height in CSS pixels. */
  height: number;
  /** How the canvas fits the surrounding box:
   *
   *   - "contain" (default): smaller ratio wins; whole canvas is
   *     visible, letterbox bars fill the leftover axis. Use for slide
   *     decks / dashboards where no content can be clipped.
   *
   *   - "cover": larger ratio wins; canvas fills both short edges of
   *     the box, the longer axis overshoots and gets clipped by the
   *     wrapper's `overflow:hidden`. Use for short-form immersive
   *     content (story / Reels) where edge-to-edge matters more than
   *     pixel-perfect preservation.
   */
  fit?: "contain" | "cover";
  /** Inner content (typically the `<HtmlInlineFrame>` / `<DashboardSurface>`
   *  wrapping the prerendered HTML). */
  children: ReactNode;
  /** Optional class merged onto the inner stage element. */
  stageClassName?: string;
}

export function ScaledStage({
  width,
  height,
  fit = "contain",
  children,
  stageClassName,
}: ScaledStageProps) {
  // `container-type: size` exposes the wrapper's width AND height to
  // descendants. (`inline-size` alone would expose only width — not
  // enough for `min(cqw, cqh)` contain semantics.)
  //
  // Important: `scale()` takes a unitless ratio. `100cqw / 1920` would
  // be `length / unitless = length` (invalid input → silent fallback to
  // identity scale, content overflows). Dividing length by length
  // (`100cqw / 1920px`) yields a unitless ratio. We wrap each branch
  // in `calc(...)` so older parsers see the unit math explicitly.
  //
  // contain → min(W_ratio, H_ratio)  (canvas inside box, letterbox bars)
  // cover   → max(W_ratio, H_ratio)  (canvas fills box, long axis clipped)
  //
  // For cover, a naive `max(...)` blows up on viewports that are wider
  // than the canvas (story = 9:16 displayed on a 16:9 desktop ⇒ scale
  // ~3.8×, ~70% of content clipped). The user-visible expectation is:
  //   - viewport portrait-ish (narrower than the canvas's aspect)
  //     → cover, fill the short edge so the screen feels immersive
  //   - viewport landscape (wider than the canvas's aspect)
  //     → fall back to contain so the whole canvas is visible
  // Express that via a media query on aspect-ratio: when the viewport's
  // W/H is ≥ canvas W/H, we're "wider than canvas" → contain. Below
  // that, we cover. The crossover (equal aspects) is exactly where both
  // formulas evaluate identically, so there's no visible snap.
  const containTransform = `scale(min(calc(100cqw / ${width}px), calc(100cqh / ${height}px)))`;
  const coverTransform = `scale(max(calc(100cqw / ${width}px), calc(100cqh / ${height}px)))`;
  // Per-instance class so the scoped <style> block only affects this
  // stage, not others on the page.
  const cls = `huozi-canvas-stage--${width}x${height}-${fit}`;
  // For cover-fit, contain is the safe default: even if the media query
  // somehow fails to register (RSC <style> hoisting quirks, display:none
  // ancestors, container-query non-resolution), contain never blows up
  // the canvas — at worst portrait phones see a small letterbox where
  // we wanted edge-to-edge, which is acceptable. The cover override
  // applies ONLY when the viewport is narrower than the canvas aspect
  // (genuine portrait-phone case).
  const css =
    fit === "cover"
      ? `.${cls}{transform:${containTransform}}@media (max-aspect-ratio: ${width}/${height}){.${cls}{transform:${coverTransform}}}`
      : `.${cls}{transform:${containTransform}}`;
  const stageStyle: CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: "center center",
  };
  return (
    <div className="huozi-canvas-frame w-full h-full overflow-hidden grid place-items-center [container-type:size]">
      {/* React 19 hoists in-tree <style> to <head>; the per-dims class
          name keeps the rule local to this instance. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className={`huozi-canvas-stage shrink-0 ${cls}${stageClassName ? " " + stageClassName : ""}`}
        style={stageStyle}
      >
        {children}
      </div>
    </div>
  );
}
