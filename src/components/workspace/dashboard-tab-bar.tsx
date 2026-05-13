"use client";

/**
 * Platform-managed tab bar for `huozi:format=dashboard`.
 *
 * Owns:
 *   - Tab buttons + active-state highlight
 *   - URL hash sync (`#kanban` activates the matching tab on load, and
 *     selecting a tab rewrites the hash with `history.replaceState` —
 *     no history entries to avoid Back-button confusion)
 *   - `[data-tab]` mutex visibility — toggles `is-active` class on the
 *     matching `<section>` inside the host wrapper
 *   - Refresh ticker — when `<meta huozi:refresh="30s">` is declared,
 *     fires `huozi.emit('tab', {tabId, reason:'refresh'})` periodically
 *   - Event bus events — `init` on first activation per tab, `show`
 *     on user-initiated switches, `refresh` on ticker / `huozi.refresh()`
 *
 * Doesn't own:
 *   - Tab data fetching (author registers via `huozi.on('tab', …)`)
 *   - Tab UI inside the section (author writes the content)
 *
 * The component looks up `[data-tab]` siblings inside `hostRef.current`
 * imperatively (not via React children) because the section content is
 * already rendered via dangerouslySetInnerHTML — it lives in the DOM
 * but is invisible to React. This is consistent with how
 * FullscreenPager finds `[data-page]` sections.
 */

import { useEffect, useRef, useState } from "react";
import type { TabEntry } from "@/lib/html/extract-tabs";

export interface DashboardTabBarProps {
  tabs: TabEntry[];
  /** Auto-refresh interval in milliseconds. `null` = no ticker. */
  refreshMs: number | null;
  /**
   * Ref to the host element wrapping the dashboard's HTML. Used to scope
   * `[data-tab]` queries — without scoping, two dashboards side-by-side
   * in some future split-pane UI would fight over each other's sections.
   */
  hostRef: React.RefObject<HTMLElement | null>;
}

interface HuoziWindow extends Window {
  huozi?: {
    tabs?: TabEntry[];
    activeTab?: string | null;
    emit?: (name: string, detail: unknown) => void;
  };
}

export function DashboardTabBar({
  tabs,
  refreshMs,
  hostRef,
}: DashboardTabBarProps) {
  // Resolve initial active tab from URL hash if it matches a declared tab,
  // else default to the first declared tab. The hash check runs in an
  // effect (window isn't available at SSR), so SSR's initial render uses
  // the first tab; client-side hydration fixes up if hash differs.
  const [activeId, setActiveId] = useState<string>(tabs[0]?.id ?? "");
  const initFired = useRef<Set<string>>(new Set());

  // Hash → state sync. Runs once on mount + listens for back/forward.
  useEffect(() => {
    if (tabs.length === 0) return;
    const tabIds = new Set(tabs.map((t) => t.id));
    const fromHash = () => {
      const id = (window.location.hash || "").replace(/^#/, "");
      if (id && tabIds.has(id)) setActiveId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  // Active → DOM sync. Toggle `.is-active` on matching [data-tab].
  // Also flag the wrapper with `.huozi-has-tabs` so the CSS fallback
  // ("no tabs → show all sections") flips off when we DO have tabs.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const dashboard = host.querySelector(".huozi-dashboard") ?? host;
    dashboard.classList.add("huozi-has-tabs");
    const sections = host.querySelectorAll<HTMLElement>("[data-tab]");
    sections.forEach((el) => {
      el.classList.toggle("is-active", el.dataset.tab === activeId);
    });
  }, [activeId, hostRef]);

  // Active → window.huozi sync + emit event. `init` fires once per tabId
  // (first activation), `show` on subsequent activations. `huozi` is set
  // up by the `data` bundle's init shim — if the author didn't declare
  // `bundle=data` there's no bus to emit to, and we no-op silently.
  useEffect(() => {
    if (!activeId) return;
    const w = window as HuoziWindow;
    if (!w.huozi) return;
    w.huozi.tabs = tabs;
    w.huozi.activeTab = activeId;
    const isFirst = !initFired.current.has(activeId);
    initFired.current.add(activeId);
    w.huozi.emit?.("tab", {
      tabId: activeId,
      reason: isFirst ? "init" : "show",
    });
  }, [activeId, tabs]);

  // Auto-refresh ticker. Emits `refresh` reason for whichever tab is
  // currently active. Author chooses what to do with that — re-fetch
  // data, repaint a chart, etc.
  useEffect(() => {
    if (!refreshMs || refreshMs <= 0) return;
    const id = window.setInterval(() => {
      const w = window as HuoziWindow;
      if (!w.huozi || !w.huozi.activeTab) return;
      w.huozi.emit?.("tab", {
        tabId: w.huozi.activeTab,
        reason: "refresh",
      });
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  if (tabs.length === 0) return null;

  // Two-layer wrapper:
  //   .huozi-tab-bar          → full-bleed bar (spans the dashboard width,
  //                              gets the bg + border-bottom)
  //   .huozi-tab-bar-inner    → centered inner column (max-width matching
  //                              author's `.wrap`-style container so the
  //                              buttons align with the content below)
  //
  // Defaults (1400px / 28px) match the dogfood dashboard.html. Authors
  // with different content widths can pre-empt the misalignment by setting
  // the same CSS variables on `:scope` — they'll cascade through `.huozi-
  // tab-bar-inner` thanks to `inherit` semantics for custom properties.
  return (
    <div className="huozi-tab-bar border-b border-border bg-background/80 backdrop-blur">
      <div
        role="tablist"
        aria-label="Dashboard tabs"
        className="huozi-tab-bar-inner flex flex-wrap items-center gap-1
                   px-2 py-1.5 text-sm"
      >
        {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`data-tab-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              setActiveId(t.id);
              // Use replaceState (not pushState) so the back button doesn't
              // accumulate per-tab entries — dashboard users expect Back
              // to leave the dashboard, not retrace their tab clicks.
              if (
                typeof window !== "undefined" &&
                window.history?.replaceState
              ) {
                window.history.replaceState(
                  null,
                  "",
                  `${window.location.pathname}${window.location.search}#${t.id}`,
                );
              }
            }}
            className={[
              "px-3 py-1 rounded-md transition-colors",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}
