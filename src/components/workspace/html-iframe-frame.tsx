"use client";

/**
 * iframe-backed author HTML surface.
 *
 * Huozi's host chrome (workspace header, fullscreen controls, page outline,
 * dashboard tabs) stays in the parent React tree. The author document itself
 * runs inside `srcDoc`, where normal browser parsing executes inline scripts
 * and bundle inits exactly once. A tiny postMessage bridge connects the two:
 * parent chrome sends page/tab/refresh commands; iframe reports active
 * page/tab and natural height.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { buildHtmlIframeSrcDoc } from "@/lib/html/iframe-document";
import type { HuoziFormat } from "@/lib/html/detect-format";
import type { PageEntry } from "@/lib/html/extract-pages";
import type { TabEntry } from "@/lib/html/extract-tabs";
import { useFullscreen } from "./fullscreen-context";

export interface HtmlIframeFrameProps {
  /** Sanitized HTML from `processHtmlDirect`. */
  html: string;
  /** Wrapper className applied to the iframe element. */
  hostClassName: string;
  /** Inline style for the iframe element. */
  hostStyle: CSSProperties;
  /** Detected huozi:format. */
  format: HuoziFormat;
  /** Extracted page list; kept on the surface for chrome parity. */
  pages: PageEntry[];
  /** Singular noun for the pager indicator. */
  pageUnit?: "page" | "slide" | "sheet";
  /** Dashboard tabs, if any. */
  tabs?: TabEntry[];
  /** Dashboard refresh interval. */
  refreshMs?: number | null;
  /** Long-flow blog path: grow the iframe to its document height. */
  autoHeight?: boolean;
}

interface FrameMessage {
  source?: string;
  type?: string;
  detail?: Record<string, unknown>;
}

function isMobilePortrait(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width:767px) and (orientation:portrait)").matches
  );
}

function postToFrame(
  frame: HTMLIFrameElement | null,
  type: string,
  detail: Record<string, unknown>,
): void {
  frame?.contentWindow?.postMessage({ source: "huozi-host", type, detail }, "*");
}

export function HtmlIframeFrame({
  html,
  hostClassName,
  hostStyle,
  format,
  pages,
  tabs = [],
  refreshMs = null,
  autoHeight = false,
}: HtmlIframeFrameProps) {
  const { setFullscreen } = useFullscreen();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const srcDoc = useMemo(
    () => buildHtmlIframeSrcDoc({ html, format, tabs, refreshMs }),
    [html, format, tabs, refreshMs],
  );
  const measureFrameHeight = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    const body = doc.body;
    const height = Math.max(
      root?.scrollHeight ?? 0,
      body?.scrollHeight ?? 0,
      root?.offsetHeight ?? 0,
      body?.offsetHeight ?? 0,
    );
    if (Number.isFinite(height) && height > 0) {
      setFrameHeight(Math.max(160, Math.ceil(height)));
    }
  }, []);

  useEffect(() => {
    if (format !== "deck") return;
    if (!isMobilePortrait()) return;
    setFullscreen(true);
  }, [format, setFullscreen]);
  useEffect(() => {
    if (!autoHeight) return;
    measureFrameHeight();
    const t1 = window.setTimeout(measureFrameHeight, 100);
    const t2 = window.setTimeout(measureFrameHeight, 500);
    const t3 = window.setTimeout(measureFrameHeight, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [autoHeight, measureFrameHeight, srcDoc]);


  useEffect(() => {
    const frame = iframeRef.current;
    function onMessage(event: MessageEvent<FrameMessage>) {
      if (event.source !== frame?.contentWindow) return;
      const data = event.data ?? {};
      if (data.source !== "huozi-frame") return;
      if (data.type === "resize" && autoHeight) {
        const height = Number(data.detail?.height);
        if (Number.isFinite(height) && height > 0) {
          setFrameHeight(Math.max(160, Math.ceil(height)));
        }
      }
      if (data.type === "ready") {
        window.dispatchEvent(
          new CustomEvent("huozi:frame:ready", { detail: data.detail ?? {} }),
        );
      }
      if (data.type === "page:changed") {
        window.dispatchEvent(
          new CustomEvent("huozi:page:changed", { detail: data.detail ?? {} }),
        );
      }
      if (data.type === "tab:changed") {
        window.dispatchEvent(
          new CustomEvent("huozi:tab:changed", { detail: data.detail ?? {} }),
        );
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [autoHeight, srcDoc]);

  useEffect(() => {
    function onPageGo(event: Event) {
      const detail = (event as CustomEvent<{ pageId?: string }>).detail ?? {};
      if (!detail.pageId) return;
      postToFrame(iframeRef.current, "page:go", { pageId: detail.pageId });
    }
    function onTabGo(event: Event) {
      const detail = (event as CustomEvent<{ tabId?: string; reason?: string }>).detail ?? {};
      if (!detail.tabId) return;
      postToFrame(iframeRef.current, "tab:go", {
        tabId: detail.tabId,
        reason: detail.reason ?? "show",
      });
    }
    function onRefresh() {
      postToFrame(iframeRef.current, "refresh", {});
    }
    window.addEventListener("huozi:page:go", onPageGo);
    window.addEventListener("huozi:tab:go", onTabGo);
    window.addEventListener("huozi:refresh", onRefresh);
    return () => {
      window.removeEventListener("huozi:page:go", onPageGo);
      window.removeEventListener("huozi:tab:go", onTabGo);
      window.removeEventListener("huozi:refresh", onRefresh);
    };
  }, [pages]);

  const style: CSSProperties = {
    ...hostStyle,
    border: 0,
    ...(autoHeight
      ? { height: frameHeight ? `${frameHeight}px` : hostStyle.height ?? 320 }
      : null),
  };

  return (
    <iframe
      ref={iframeRef}
      title={`${format} HTML preview`}
      className={`huozi-html-host huozi-html-iframe block ${hostClassName}`}
      style={style}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="no-referrer-when-downgrade"
      onLoad={() => {
        if (!autoHeight) return;
        measureFrameHeight();
        window.setTimeout(measureFrameHeight, 100);
        window.setTimeout(measureFrameHeight, 500);
      }}
    />
  );
}
