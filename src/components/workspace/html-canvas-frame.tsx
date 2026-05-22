/**
 * Single source of truth for "given a sanitized HTML payload + its
 * detected format, render the canvas frame".
 *
 * Workspace inline (file-renderer), workspace fullscreen, and the
 * public share view all call this component with the same prepared
 * inputs. The visual output is byte-identical across the three modes —
 * the only thing that differs at higher layers is whether the result is
 * wrapped in an EditableSurface (workspace, click-to-edit) or left
 * un-wrapped (share, read-only). FullscreenContent on top adds the
 * close-button chrome and forces `.huozi-canvas-outer` to viewport
 * dims; same component, just toggled open/closed via context vs always-
 * open in the share page. No layer below FullscreenContent should
 * branch on "are we in share view" — that's what's been bleeding
 * subtle inconsistencies between workspace and publish surfaces.
 *
 * Dispatch (mirrors lib/html/canvas.ts):
 *
 *   - canvas.mode = "scale" + dashboard → DashboardSurface inside
 *     ScaledStage; canvas-outer carries aspect-ratio + max-width and
 *     the platform-declared background bleed.
 *   - canvas.mode = "scale" + deck/story → HtmlInlineFrame inside
 *     ScaledStage; same outer treatment.
 *   - canvas.mode = "lock-width" + paper → HtmlInlineFrame inside
 *     FixedWidthStage; outer locks width + vertical scroll, no
 *     transform-scale.
 *   - canvas = null + blog/unknown → HtmlInlineFrame with the
 *     `[&_.huozi-blog]:!min-h-0` long-flow hint; no outer, content
 *     just streams into the surrounding column.
 *
 * Pure server / SSR-safe. No "use client" — both async server callers
 * and the client share-viewer import this directly. None of the
 * imports reach for server-only APIs (cookies, fs, fetch) so it
 * compiles into either tree.
 */

import type { CSSProperties } from "react";
import { type CanvasSpec } from "@/lib/html/canvas";
import { type HuoziFormat } from "@/lib/html/detect-format";
import type { PageEntry } from "@/lib/html/extract-pages";
import type { TabEntry } from "@/lib/html/extract-tabs";
import { DashboardSurface } from "@/components/workspace/dashboard-surface";
import { HtmlInlineFrame } from "@/components/workspace/html-inline-frame";
import { ScaledStage } from "@/components/workspace/scaled-stage";
import { FixedWidthStage } from "@/components/workspace/fixed-width-stage";

export interface HtmlCanvasFrameProps {
  /** Sanitized + scoped HTML payload. Caller is responsible for passing
   *  bytes that are safe to drop into `dangerouslySetInnerHTML`. */
  html: string;
  /** Detected huozi format (deck / story / paper / dashboard / blog). */
  format: HuoziFormat;
  /** Resolved canvas spec from `resolveCanvas(rawContent, format)`.
   *  `null` for blog / unknown — the component then renders the long-
   *  flow path. */
  canvas: CanvasSpec | null;
  /** Pages extracted by `extractPages`; threaded through to the inline
   *  frame for pager / outline chrome. */
  pages: PageEntry[];
  /** Singular noun for the pager indicator. */
  pageUnit?: "page" | "slide" | "sheet";
  /** Dashboard-only: tab manifest from `extractTabs`. */
  tabs?: TabEntry[];
  /** Dashboard-only: refresh interval in ms (or null = no auto-refresh). */
  refreshMs?: number | null;
}

// Tailwind override that pins the file's root layout container to fill
// the canvas stage. Files that declare `.huozi-deck` / `.huozi-story` /
// `.huozi-paper` typically set `width: 100vw; height: 100vh;` against
// the published page — inside a stage we need them to take 100% of
// their (fixed-pixel) parent instead. `!important` beats the file's
// own rules.
const STRETCH_ROOTS =
  "!w-full !h-full" +
  " [&_.huozi-story]:!w-full [&_.huozi-story]:!h-full [&_.huozi-story]:!min-h-0" +
  " [&_.huozi-deck]:!w-full [&_.huozi-deck]:!h-full [&_.huozi-deck]:!min-h-0";

// For paper / lock-width canvases: width follows the column, height
// flows with content. Pinning `h-full` would cap content; pinning
// `min-h: 0` lets the inner paper grow.
const STRETCH_PAPER = "!w-full [&_.huozi-paper]:!min-h-0";

// Long-flow (blog): no canvas. The host follows block width; the only
// override needed is `min-h: 0` on the file's `.huozi-blog` so its
// flex/grid children compute correctly inside the workspace's flex
// column.
const FLOW_BLOG = "[&_.huozi-blog]:!min-h-0";

const STRETCH_STYLE: CSSProperties = { width: "100%", height: "100%" };
const LOCKED_WIDTH_STYLE: CSSProperties = { width: "100%" };

export function HtmlCanvasFrame(props: HtmlCanvasFrameProps) {
  const { html, format, canvas, pages, pageUnit, tabs, refreshMs } = props;

  // No canvas (blog / unknown long-flow). Render naturally.
  if (!canvas) {
    return (
      <HtmlInlineFrame
        html={html}
        hostClassName={FLOW_BLOG}
        hostStyle={LOCKED_WIDTH_STYLE}
        format={format}
        pages={pages}
        pageUnit={pageUnit}
      />
    );
  }

  // Canvas inner — the actual content frame inside the stage. Dashboard
  // uses its dedicated surface (carries tab chrome + refresh ticker);
  // everything else (deck / story / paper) uses HtmlInlineFrame.
  const inner =
    format === "dashboard" ? (
      <DashboardSurface
        html={html}
        hostClassName={STRETCH_ROOTS}
        hostStyle={STRETCH_STYLE}
        tabs={tabs ?? []}
        refreshMs={refreshMs ?? null}
      />
    ) : (
      <HtmlInlineFrame
        html={html}
        hostClassName={
          canvas.mode === "lock-width" ? STRETCH_PAPER : STRETCH_ROOTS
        }
        hostStyle={
          canvas.mode === "lock-width" ? LOCKED_WIDTH_STYLE : STRETCH_STYLE
        }
        format={format}
        pages={pages}
        pageUnit={pageUnit}
      />
    );

  // Outer frame — carries inline-preview sizing (aspect-ratio +
  // max-width) and the canvas bleed background. Fullscreen / share-view
  // path overrides these to fill the viewport via Tailwind selectors on
  // `.huozi-canvas-outer` in FullscreenContent.
  if (canvas.mode === "scale") {
    return (
      <div
        className="huozi-canvas-outer"
        style={{
          width: "100%",
          aspectRatio: `${canvas.width} / ${canvas.height}`,
          maxWidth: `${canvas.width}px`,
          marginLeft: "auto",
          marginRight: "auto",
          background: canvas.background,
        }}
      >
        <ScaledStage
          width={canvas.width}
          height={canvas.height!}
          fit={canvas.fit}
        >
          {inner}
        </ScaledStage>
      </div>
    );
  }

  // canvas.mode === "lock-width" — paper. No aspect-ratio (height
  // flows); height capped to a reading-sized box in workspace inline
  // (fullscreen/share override to fill viewport).
  return (
    <div
      className="huozi-canvas-outer"
      style={{
        width: "100%",
        height: "min(80vh, 1100px)",
        maxWidth: `${canvas.width}px`,
        marginLeft: "auto",
        marginRight: "auto",
        background: canvas.background,
      }}
    >
      <FixedWidthStage width={canvas.width}>{inner}</FixedWidthStage>
    </div>
  );
}
