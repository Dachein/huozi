"use client";

/**
 * Platform-managed tab bar for `huozi:format=dashboard`.
 *
 * The bar is intentionally rendered by the host, not author HTML. In iframe
 * mode it sends `huozi:tab:go` / `huozi:refresh` events that HtmlIframeFrame
 * forwards into the author document. For older direct-DOM callers, the
 * optional `hostRef` path still toggles `[data-tab]` in place.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { TabEntry } from "@/lib/html/extract-tabs";

export interface DashboardTabBarProps {
  tabs: TabEntry[];
  /** Auto-refresh interval in milliseconds. `null` = no ticker. */
  refreshMs: number | null;
  /** Optional direct-DOM host used by legacy/non-iframe surfaces. */
  hostRef?: RefObject<HTMLElement | null>;
}

interface HuoziWindow extends Window {
  huozi?: {
    tabs?: TabEntry[];
    activeTab?: string | null;
    emit?: (name: string, detail: unknown) => void;
  };
}

function replaceHash(id: string): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${id}`,
  );
}

export function DashboardTabBar({
  tabs,
  refreshMs,
  hostRef,
}: DashboardTabBarProps) {
  const [activeId, setActiveId] = useState<string>(tabs[0]?.id ?? "");
  const initFired = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (tabs.length === 0) return;
    const tabIds = new Set(tabs.map((t) => t.id));
    function onFrameTab(event: Event) {
      const detail = (event as CustomEvent<{ tabId?: string }>).detail ?? {};
      const id = detail.tabId;
      if (!id || !tabIds.has(id)) return;
      setActiveId(id);
      replaceHash(id);
    }
    window.addEventListener("huozi:tab:changed", onFrameTab);
    return () => window.removeEventListener("huozi:tab:changed", onFrameTab);
  }, [tabs]);

  useEffect(() => {
    const host = hostRef?.current;
    if (!host) return;
    const dashboard = host.querySelector(".huozi-dashboard") ?? host;
    dashboard.classList.add("huozi-has-tabs");
    const sections = host.querySelectorAll<HTMLElement>("[data-tab]");
    sections.forEach((el) => {
      el.classList.toggle("is-active", el.dataset.tab === activeId);
    });
  }, [activeId, hostRef]);

  useEffect(() => {
    if (!activeId) return;
    const isFirst = !initFired.current.has(activeId);
    initFired.current.add(activeId);
    const detail = {
      tabId: activeId,
      reason: isFirst ? "init" : "show",
    };

    const w = window as HuoziWindow;
    if (w.huozi) {
      w.huozi.tabs = tabs;
      w.huozi.activeTab = activeId;
      w.huozi.emit?.("tab", detail);
    }
    window.dispatchEvent(new CustomEvent("huozi:tab:go", { detail }));
  }, [activeId, tabs]);

  useEffect(() => {
    if (!activeId) return;
    function onFrameReady() {
      window.dispatchEvent(
        new CustomEvent("huozi:tab:go", {
          detail: { tabId: activeId, reason: "show" },
        }),
      );
    }
    window.addEventListener("huozi:frame:ready", onFrameReady);
    return () => window.removeEventListener("huozi:frame:ready", onFrameReady);
  }, [activeId]);

  useEffect(() => {
    if (!refreshMs || refreshMs <= 0) return;
    const id = window.setInterval(() => {
      const tabId = activeId || tabs[0]?.id;
      if (!tabId) return;
      const detail = { tabId, reason: "refresh" };
      const w = window as HuoziWindow;
      if (w.huozi) {
        w.huozi.activeTab = tabId;
        w.huozi.emit?.("tab", detail);
      }
      window.dispatchEvent(new CustomEvent("huozi:refresh", { detail }));
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [activeId, refreshMs, tabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="huozi-tab-bar border-b border-border bg-background/80 backdrop-blur">
      <div
        role="tablist"
        aria-label="Dashboard tabs"
        className="huozi-tab-bar-inner flex flex-wrap items-center gap-1 px-2 py-1.5 text-sm"
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
                replaceHash(t.id);
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
