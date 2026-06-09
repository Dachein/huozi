"use client";

/**
 * Client wrapper for `huozi:format=dashboard` HTML rendering.
 *
 * Platform dashboard chrome remains in the parent React tree:
 *   - `DashboardTabBar` renders above the content and owns active tab UI.
 *   - `HtmlIframeFrame` hosts the author dashboard document and receives
 *     tab/refresh commands through the standard huozi host bridge.
 *
 * Keeping chrome outside the iframe gives us one tab component across
 * workspace inline, fullscreen, `/p`, and `/o`, while the author document
 * gets normal browser script execution and CSS isolation inside `srcDoc`.
 */

import type { CSSProperties } from "react";
import type { TabEntry } from "@/lib/html/extract-tabs";
import { DashboardTabBar } from "./dashboard-tab-bar";
import { HtmlIframeFrame } from "./html-iframe-frame";

export interface DashboardSurfaceProps {
  /** Sanitized HTML from `processHtmlDirect`. */
  html: string;
  /** Outer-wrapper className (sizing overrides). Concatenated with
   *  `huozi-dashboard-surface flex flex-col w-full h-full min-h-0`. */
  hostClassName?: string;
  /** Outer-wrapper inline style. */
  hostStyle?: CSSProperties;
  /** Parsed tabs from `<meta huozi:tabs>`. Empty -> no TabBar rendered. */
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
  return (
    <div
      className={`huozi-dashboard-surface flex flex-col w-full h-full min-h-0 ${hostClassName}`}
      style={hostStyle}
    >
      {tabs.length > 0 && <DashboardTabBar tabs={tabs} refreshMs={refreshMs} />}
      <HtmlIframeFrame
        html={html}
        hostClassName="flex-1 min-h-0 w-full h-full"
        hostStyle={{ width: "100%", height: "100%" }}
        format="dashboard"
        pages={[]}
        tabs={tabs}
        refreshMs={refreshMs}
      />
    </div>
  );
}
