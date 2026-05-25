"use client";

/**
 * Visual replay of stored clippings.
 *
 * Mounted inside an EditableSurface, this component:
 *   1. Loads the sidecar via GET /api/app/drive/highlights?path=…
 *   2. Resolves each highlight back to a live DOM Range
 *   3. Registers all ranges with the CSS Custom Highlight API under the
 *      `huozi-hl` registry (styled via globals.css `::highlight(huozi-hl)`)
 *
 * No DOM mutation — the underline lives entirely in the highlight
 * pseudo-element, so the underlying renderer (markdown, html, jsonl)
 * doesn't need to know clippings exist. This is what lets the layer be
 * independent of every file-kind renderer.
 *
 * The layer also publishes resolved highlights via the shared store so
 * the side drawer can list them and trigger scroll-to behavior without a
 * second resolve pass.
 */

import { useEffect, useRef } from "react";
import type { HighlightWithSource } from "@/lib/highlights/types";
import { resolveHighlightRange } from "./resolve-range";
import { publishHighlights } from "./store";

interface HighlightLayerProps {
  sourcePath: string;
}

const HIGHLIGHT_REGISTRY = "huozi-hl";
const RELOAD_EVENT = "huozi:highlights-changed";

export function HighlightLayer({ sourcePath }: HighlightLayerProps) {
  // Anchor element so we can find the EditableSurface host (our parent
  // div carrying `data-source`) without prop-drilling a ref.
  const anchorRef = useRef<HTMLDivElement>(null);
  // Keep the latest list across re-mounts so we don't re-fetch on
  // every render; the layer re-runs whenever the source changes.
  const clippingsRef = useRef<HighlightWithSource[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/app/drive/highlights?path=${encodeURIComponent(sourcePath)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          // Failure to load is non-fatal — page still works without
          // clippings. We deliberately don't surface a toast here.
          return;
        }
        const data = (await res.json()) as {
          clippings: HighlightWithSource[];
        };
        if (cancelled) return;
        clippingsRef.current = Array.isArray(data.clippings)
          ? data.clippings
          : [];
        applyHighlights();
      } catch {
        // Network error — silent. Refresh will retry.
      }
    }

    function applyHighlights() {
      if (typeof window === "undefined") return;
      const host = anchorRef.current?.parentElement;
      if (!host) return;
      const list = clippingsRef.current;

      // CSS Custom Highlight API gate. Older browsers without it still
      // get clipping + the drawer; only the in-text underline is missing.
      const highlightsApi = (CSS as unknown as {
        highlights?: Map<string, Highlight>;
      }).highlights;

      if (list.length === 0) {
        highlightsApi?.delete(HIGHLIGHT_REGISTRY);
        publishHighlights(sourcePath, []);
        return;
      }

      // Resolve each highlight to a Range (+ track which couldn't be
      // re-anchored so the drawer can show them as "orphan").
      const resolved = list.map((h) => ({
        highlight: h,
        range: resolveHighlightRange(host, h),
      }));

      const liveRanges = resolved
        .map((r) => r.range)
        .filter((r): r is Range => r !== null);

      if (highlightsApi && typeof Highlight !== "undefined") {
        if (liveRanges.length === 0) {
          highlightsApi.delete(HIGHLIGHT_REGISTRY);
        } else {
          highlightsApi.set(
            HIGHLIGHT_REGISTRY,
            new Highlight(...liveRanges),
          );
        }
      }

      publishHighlights(sourcePath, resolved);
    }

    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ sourcePath?: string }>).detail;
      if (detail?.sourcePath && detail.sourcePath !== sourcePath) return;
      void load();
    }

    void load();
    window.addEventListener(RELOAD_EVENT, onChange);

    return () => {
      cancelled = true;
      window.removeEventListener(RELOAD_EVENT, onChange);
      const highlightsApi = (CSS as unknown as {
        highlights?: Map<string, Highlight>;
      }).highlights;
      highlightsApi?.delete(HIGHLIGHT_REGISTRY);
      publishHighlights(sourcePath, []);
    };
  }, [sourcePath]);

  // Zero-size anchor — purely a hook for finding the EditableSurface
  // host element from a ref. Never rendered visibly.
  return (
    <div
      ref={anchorRef}
      aria-hidden
      data-huozi-highlight-layer
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    />
  );
}
