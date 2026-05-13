"use client";

/**
 * Client wrapper for `huozi:format=dashboard` HTML rendering.
 *
 * Composes:
 *   - `DashboardTabBar` (when `tabs.length > 0`) — platform-managed tab
 *     chrome rendered above the host
 *   - `.huozi-html-host` div — author HTML via dangerouslySetInnerHTML,
 *     same wrapper class as static formats so author CSS scoping works
 *     uniformly
 *
 * Layout structure:
 *
 *   <div class="huozi-dashboard-surface flex flex-col"
 *        style="aspect-ratio:16/9; width:100%">         ← outer sizing
 *     <DashboardTabBar />                               ← natural height
 *     <div class="huozi-html-host flex-1 min-h-0 overflow-auto">
 *       <author content>                                ← takes rest, scrolls
 *     </div>
 *   </div>
 *
 * Why aspect-ratio is on the OUTER wrapper, not the host:
 *   - In inline preview, the outer wrapper's 16:9 aspect-ratio determines
 *     overall height. TabBar takes its natural height, host gets `flex-1`
 *     to fill the remainder. The total = aspect-ratio box. Without this,
 *     TabBar (40px) + 16:9 host = aspect-ratio box + 40px, which is no
 *     longer 16:9.
 *   - In fullscreen, FullscreenContent uses
 *     `[&_.huozi-dashboard-surface]:!aspect-auto` to drop the aspect
 *     constraint so the outer wrapper fills `h-full` (100vh).
 *
 * Why TabBar is OUTSIDE `.huozi-html-host`:
 *   - The sanitizer scopes author CSS with `@scope (.huozi-html-host)`.
 *     If TabBar were inside the host, author rules could target it.
 *     Keeping it outside makes platform chrome immune to author CSS.
 *
 * Used by both surfaces (workspace inline preview + `/p/<slug>` publish)
 * so the dashboard experience is identical. Non-dashboard formats keep
 * using `HtmlInlineFrame` (workspace) / direct `<article>`
 * (share-viewer) — unchanged.
 *
 * The TabBar mutates `[data-tab]` visibility via DOM (not React state)
 * because the section content lives in dangerouslySetInnerHTML — it's
 * in the DOM but invisible to React. This is the same pattern
 * `FullscreenPager` uses for `[data-page]`.
 */

import { useRef, type CSSProperties } from "react";
import type { TabEntry } from "@/lib/html/extract-tabs";
import { DashboardTabBar } from "./dashboard-tab-bar";

export interface DashboardSurfaceProps {
  /** Sanitized + scoped HTML from `processHtmlDirect`. */
  html: string;
  /** Outer-wrapper className (sizing overrides). Concatenated with
   *  `huozi-dashboard-surface flex flex-col w-full h-full min-h-0`. */
  hostClassName?: string;
  /** Outer-wrapper inline style. Typically `{width:100%, aspectRatio:"16/9"}`
   *  for inline preview; left undefined for fullscreen / publish where the
   *  parent container drives sizing. */
  hostStyle?: CSSProperties;
  /** Parsed tabs from `<meta huozi:tabs>`. Empty → no TabBar rendered. */
  tabs: TabEntry[];
  /** Auto-refresh interval in ms (parsed from `<meta huozi:refresh>`). */
  refreshMs: number | null;
}

export function DashboardSurface({
  html,
  hostClassName = "",
  hostStyle,
  tabs,
  refreshMs,
}: DashboardSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className={`huozi-dashboard-surface flex flex-col w-full h-full min-h-0 ${hostClassName}`}
      style={hostStyle}
    >
      {tabs.length > 0 && (
        <DashboardTabBar
          tabs={tabs}
          refreshMs={refreshMs}
          hostRef={hostRef}
        />
      )}
      <div
        ref={hostRef}
        className="huozi-html-host block flex-1 min-h-0 overflow-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
