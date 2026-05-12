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
  /** Wrapper className (sizing overrides). Concatenated with `huozi-html-host`. */
  hostClassName?: string;
  /** Inline style (aspect-ratio, max-width, max-height, etc.). */
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
    <div className="flex flex-col w-full h-full min-h-0">
      {tabs.length > 0 && (
        <DashboardTabBar
          tabs={tabs}
          refreshMs={refreshMs}
          hostRef={hostRef}
        />
      )}
      <div
        ref={hostRef}
        className={`huozi-html-host block ${hostClassName}`}
        style={hostStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
