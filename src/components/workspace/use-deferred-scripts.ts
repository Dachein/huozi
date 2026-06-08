"use client";

/**
 * Client-side runner for scripts the sanitizer deferred (see
 * `processHtmlDirect`'s `deferScripts` option).
 *
 * Why this exists: the workspace preview renders author HTML via React
 * `dangerouslySetInnerHTML`. On SPA client-navigation the browser never
 * executes `<script>` inserted that way, so author logic and platform
 * bundle inits would silently never run (the page just sits on its
 * loading state). On a hard SSR load the same scripts WOULD execute at
 * parse — an inconsistency. The sanitizer resolves this by emitting every
 * `<script>` as `type="application/huozi-deferred"` (non-executable) on
 * the workspace surface; this hook re-injects them as live scripts in
 * document order, exactly once, after mount — giving identical,
 * exactly-once execution across hard-load and SPA-nav.
 *
 * `/p` and `/o` never set `deferScripts`, so their HTML contains no
 * deferred scripts and this hook is a no-op there (the presence of
 * deferred scripts is itself the activation signal — no prop threading).
 *
 * External scripts carry their URL in `data-huozi-src`; we restore the
 * real `src` and await load before running later inline scripts, so a
 * library (e.g. echarts) is ready before author code that depends on it.
 */

import { useEffect, type RefObject } from "react";

const DEFERRED_SELECTOR = 'script[type="application/huozi-deferred"]';

export function useDeferredScripts(
  hostRef: RefObject<HTMLElement | null>,
  html: string,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const deferred = Array.from(host.querySelectorAll(DEFERRED_SELECTOR));
    if (deferred.length === 0) return;

    let cancelled = false;

    const run = async () => {
      for (const old of deferred) {
        if (cancelled || !old.isConnected) continue;
        const live = document.createElement("script");
        for (const attr of Array.from(old.attributes)) {
          if (attr.name === "type" || attr.name === "data-huozi-src") continue;
          live.setAttribute(attr.name, attr.value);
        }
        const src = old.getAttribute("data-huozi-src");
        if (src) {
          await new Promise<void>((resolve) => {
            live.onload = () => resolve();
            live.onerror = () => resolve();
            live.src = src;
            old.replaceWith(live);
          });
        } else {
          live.textContent = old.textContent;
          old.replaceWith(live);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hostRef, html]);
}
